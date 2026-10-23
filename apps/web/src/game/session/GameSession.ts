/**
 * GameSession — owns one run: the deterministic simulation, the fixed-step
 * clock, input recording, pause, tutorial flow, race timing and autopilot.
 * Phaser scenes render it; React overlays observe it through events.
 */
import {
  Autopilot,
  ChaseSimulation,
  DT,
  INPUT,
  InputRecorder,
  RACE_FLAG,
  RACE_PROGRESS_INTERVAL_MS,
  TUTORIAL_LESSONS,
  type RaceProgressInput,
  type RunConfig,
  type RunResult,
  type SimEvent,
  type TutorialLesson,
} from '@dbfc/shared';
import type { Action } from '../../lib/settings';

export type SessionMode = 'solo' | 'daily' | 'tutorial' | 'race' | 'attract';

export interface SessionOptions {
  mode: SessionMode;
  config: RunConfig;
  skin: string;
  /**
   * performance.now() timestamp of tick 0. Races use the synchronized server
   * start; solo runs get a short countdown.
   */
  startAt?: number;
  autopilot?: boolean;
}

export interface TutorialPrompt {
  lesson: TutorialLesson;
  step: 1 | 2;
  index: number;
  total: number;
}

type SessionEvents = {
  pause: (paused: boolean, reason: PauseReason | null) => void;
  prompt: (prompt: TutorialPrompt | null) => void;
  finish: (result: RunResult, inputs: number[]) => void;
  announce: (message: string) => void;
  progress: (p: RaceProgressInput) => void;
  sim: (events: readonly SimEvent[]) => void;
};

export type PauseReason = 'user' | 'blur' | 'tutorial';

/** Another racer, rendered as a translucent ghost dragon. */
export interface GhostState {
  userId: string;
  name: string;
  skin: string;
  /** Two most recent samples for interpolation: [older, newer]. */
  samples: { t: number; x: number; y: number; flags: number; hearts: number }[];
  finished: boolean;
}

const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 8;

/** Minimum hold (ticks) applied to tutorial actions so lessons always succeed. */
const TUTORIAL_HOLD: Partial<Record<Action, number>> = { jump: 20, slide: 60 };

export class GameSession {
  readonly mode: SessionMode;
  readonly config: RunConfig;
  readonly skin: string;
  sim: ChaseSimulation;
  readonly recorder = new InputRecorder();
  paused = false;
  pauseReason: PauseReason | null = null;
  /** Interpolation factor between the previous and current tick (0..1). */
  alpha = 0;
  finished = false;
  autopilot: Autopilot | null;
  readonly ghosts = new Map<string, GhostState>();
  startAt: number;
  private started = false;

  private acc = 0;
  private queue: number[] = [];
  private held = new Set<Action>();
  private listeners: { [K in keyof SessionEvents]: Set<SessionEvents[K]> } = {
    pause: new Set(),
    prompt: new Set(),
    finish: new Set(),
    announce: new Set(),
    progress: new Set(),
    sim: new Set(),
  };
  private lastProgress = 0;
  // Tutorial state
  private lessonIndex = 0;
  private prompt: TutorialPrompt | null = null;
  private forcedRelease: { action: Action; tick: number } | null = null;
  private pendingRelease = new Set<Action>();
  private leapStage: 0 | 1 | 2 = 0;

  constructor(opts: SessionOptions) {
    this.mode = opts.mode;
    this.config = opts.config;
    this.skin = opts.skin;
    this.sim = new ChaseSimulation(opts.config);
    this.startAt = opts.startAt ?? performance.now();
    this.autopilot =
      opts.autopilot || opts.mode === 'attract' ? new Autopilot({ seed: opts.config.seed }) : null;
  }

  on<K extends keyof SessionEvents>(event: K, fn: SessionEvents[K]): () => void {
    this.listeners[event].add(fn);
    return () => this.listeners[event].delete(fn);
  }

  private emit<K extends keyof SessionEvents>(
    event: K,
    ...args: Parameters<SessionEvents[K]>
  ): void {
    for (const fn of this.listeners[event])
      (fn as (...a: Parameters<SessionEvents[K]>) => void)(...args);
  }

  get isRace(): boolean {
    return this.mode === 'race';
  }

  get currentPrompt(): TutorialPrompt | null {
    return this.prompt;
  }

  /** Record a progress sample for another racer. */
  updateGhost(
    userId: string,
    name: string,
    skin: string,
    p: { x: number; y: number; flags: number; hearts: number },
  ): void {
    let g = this.ghosts.get(userId);
    if (!g) {
      g = { userId, name, skin, samples: [], finished: false };
      this.ghosts.set(userId, g);
    }
    g.samples.push({ t: performance.now(), x: p.x, y: p.y, flags: p.flags, hearts: p.hearts });
    if (g.samples.length > 2) g.samples.shift();
  }

  setAutopilot(on: boolean): void {
    this.autopilot = on ? new Autopilot({ seed: this.config.seed }) : null;
  }

  // --------------------------------------------------------------- Input

  /** A gameplay action started (key down / touch start / gamepad press). */
  press(action: Action): void {
    if (action === 'pause') {
      this.togglePause();
      return;
    }
    if (this.finished || this.mode === 'attract') return;
    if (this.held.has(action)) return;
    this.held.add(action);
    if (this.prompt) {
      this.handleTutorialPress(action);
      return;
    }
    if (this.paused) return;
    if (!this.hasStarted()) return;
    const code = pressCode(action);
    if (code !== null) this.queue.push(code);
  }

  /** A gameplay action ended. */
  release(action: Action): void {
    if (!this.held.has(action)) return;
    this.held.delete(action);
    if (this.mode === 'attract') return;
    const code = releaseCode(action);
    if (code === null) return;
    if (
      this.forcedRelease &&
      this.forcedRelease.action === action &&
      this.sim.tick < this.forcedRelease.tick
    ) {
      this.pendingRelease.add(action);
      return;
    }
    if (this.paused && !this.prompt) {
      // Releasing while paused is still applied so keys don't get "stuck".
      this.queue.push(code);
      return;
    }
    this.queue.push(code);
  }

  /** Release everything (window blur, overlay opened). */
  releaseAll(): void {
    for (const action of [...this.held]) this.release(action);
  }

  // --------------------------------------------------------------- Pause

  /** Test builds only: simulate faster than real time (never used in races). */
  timeScale = 1;

  /** Race only: the in-race menu is open (the race itself never pauses). */
  raceMenuOpen = false;

  togglePause(): void {
    if (this.isRace) {
      if (this.raceMenuOpen) this.resume();
      else this.pause('user');
      return;
    }
    if (this.paused && this.pauseReason !== 'tutorial') this.resume();
    else if (!this.paused) this.pause('user');
  }

  pause(reason: PauseReason): void {
    if (this.finished || this.mode === 'attract') return;
    // Live races cannot be paused: everyone shares the same clock. Only the menu opens.
    if (this.isRace) {
      if (reason === 'blur') return;
      this.raceMenuOpen = true;
      this.emit('pause', true, reason);
      return;
    }
    if (this.paused && this.pauseReason === 'tutorial') return;
    this.releaseAll();
    this.paused = true;
    this.pauseReason = reason;
    this.emit('pause', true, reason);
  }

  resume(): void {
    if (this.isRace) {
      this.raceMenuOpen = false;
      this.emit('pause', false, null);
      return;
    }
    if (!this.paused || this.pauseReason === 'tutorial') return;
    this.paused = false;
    this.pauseReason = null;
    this.acc = 0;
    this.emit('pause', false, null);
  }

  // --------------------------------------------------------------- Clock

  hasStarted(now = performance.now()): boolean {
    return now >= this.startAt;
  }

  /** Milliseconds until the run starts (negative once started). */
  countdown(now = performance.now()): number {
    return this.startAt - now;
  }

  /** Synchronize the start (races: set when the server announces the countdown). */
  setStartAt(t: number): void {
    this.startAt = t;
  }

  /** Advance the session by real elapsed time. Returns the number of ticks stepped. */
  frame(deltaMs: number, now = performance.now()): number {
    if (this.finished) return 0;
    let steps = 0;
    if (!this.hasStarted(now)) {
      this.alpha = 0;
      return 0;
    }
    if (!this.started) {
      this.started = true;
      this.acc = 0;
    }
    if (this.isRace) {
      const target = Math.floor((now - this.startAt) / STEP_MS);
      const budget = this.sim.tick < target - 240 ? 600 : 30;
      while (this.sim.tick < target && steps < budget && !this.finished) {
        this.stepOnce();
        steps++;
      }
      this.alpha = Math.min(
        1,
        Math.max(0, (now - this.startAt - this.sim.tick * STEP_MS) / STEP_MS + 1),
      );
      if (now - this.lastProgress >= RACE_PROGRESS_INTERVAL_MS) {
        this.lastProgress = now;
        this.emit('progress', this.progressSnapshot());
      }
      return steps;
    }
    if (this.paused) return 0;
    const scale = Math.max(1, this.timeScale);
    this.acc += Math.min(deltaMs, 250) * scale;
    while (
      this.acc >= STEP_MS &&
      steps < MAX_STEPS_PER_FRAME * scale &&
      !this.finished &&
      !this.paused
    ) {
      this.stepOnce();
      this.acc -= STEP_MS;
      steps++;
    }
    if (steps >= MAX_STEPS_PER_FRAME * scale) this.acc = Math.min(this.acc, STEP_MS);
    this.alpha = this.paused ? 1 : Math.min(1, this.acc / STEP_MS);
    return steps;
  }

  private stepOnce(): void {
    const sim = this.sim;
    if (this.autopilot) {
      for (const code of this.autopilot.decide(sim)) this.queue.push(code);
    }
    if (this.forcedRelease && sim.tick >= this.forcedRelease.tick) {
      const { action } = this.forcedRelease;
      this.forcedRelease = null;
      if (this.pendingRelease.has(action) || this.leapStage === 1) {
        this.pendingRelease.delete(action);
        const code = releaseCode(action);
        if (code !== null) this.queue.push(code);
        if (this.leapStage === 1) this.held.delete(action);
      }
    }
    for (const code of this.queue) {
      this.recorder.record(sim.tick, code);
      sim.input(code);
    }
    this.queue.length = 0;
    sim.step();
    if (sim.events.length) {
      this.emit('sim', sim.events);
      this.announceEvents(sim.events);
    }
    if (this.mode === 'tutorial') this.checkTutorial();
    if (sim.over && !this.finished) {
      this.finished = true;
      this.alpha = 1;
      this.emit('finish', sim.result(), this.recorder.toArray());
    }
  }

  private announceEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'hit' || e.type === 'pitFall') {
        this.emit(
          'announce',
          `Hit! ${this.sim.hearts} ${this.sim.hearts === 1 ? 'heart' : 'hearts'} left.`,
        );
      } else if (e.type === 'shieldBlock') {
        this.emit('announce', 'Shield absorbed the hit.');
      } else if (e.type === 'flowMax') {
        this.emit('announce', 'Maximum flow!');
      } else if (e.type === 'collect' && e.kind === 'scale') {
        this.emit('announce', 'Ancient Dragon Scale found!');
      }
    }
  }

  progressSnapshot(): RaceProgressInput {
    const s = this.sim;
    let flags = 0;
    if (s.sliding) flags |= RACE_FLAG.sliding;
    if (!s.grounded) flags |= RACE_FLAG.airborne;
    if (s.dashTicks > 0) flags |= RACE_FLAG.dashing;
    if (s.shieldTicks > 0) flags |= RACE_FLAG.shielded;
    if (s.invulnTicks > 0) flags |= RACE_FLAG.hurt;
    return {
      tick: s.tick,
      x: Math.round(s.x * 100) / 100,
      y: Math.round(s.y * 100) / 100,
      gap: Math.round(s.gap * 10) / 10,
      hearts: s.hearts,
      flags,
    };
  }

  // --------------------------------------------------------------- Tutorial

  private checkTutorial(): void {
    const sim = this.sim;
    if (this.leapStage === 1 && !sim.grounded && sim.vy <= 1) {
      this.leapStage = 2;
      const lesson = TUTORIAL_LESSONS[this.lessonIndex - 1]!;
      this.freezeFor({
        lesson,
        step: 2,
        index: this.lessonIndex - 1,
        total: TUTORIAL_LESSONS.length,
      });
      return;
    }
    const next = TUTORIAL_LESSONS[this.lessonIndex];
    if (next && sim.x >= next.x) {
      this.lessonIndex++;
      this.freezeFor({
        lesson: next,
        step: 1,
        index: this.lessonIndex - 1,
        total: TUTORIAL_LESSONS.length,
      });
    }
  }

  private freezeFor(prompt: TutorialPrompt): void {
    this.prompt = prompt;
    this.paused = true;
    this.pauseReason = 'tutorial';
    // Keys held before the prompt must be pressed again for the lesson, so
    // release them in the simulation too (inputs are edge-triggered).
    for (const action of this.held) {
      const code = releaseCode(action);
      if (code !== null) this.queue.push(code);
    }
    this.held.clear();
    this.emit('prompt', prompt);
  }

  /** Continue a "run" lesson (no action required). */
  continueTutorial(): void {
    if (this.prompt?.lesson.action === 'run') this.unfreeze();
  }

  private unfreeze(): void {
    this.prompt = null;
    this.paused = false;
    this.pauseReason = null;
    this.acc = 0;
    this.emit('prompt', null);
  }

  private handleTutorialPress(action: Action): void {
    const p = this.prompt!;
    const want = p.lesson.action;
    const sim = this.sim;
    if (want === 'run') {
      this.unfreeze();
      return;
    }
    const expected = want === 'leap' ? 'jump' : want;
    if (action !== expected) {
      this.held.delete(action);
      return;
    }
    const code = pressCode(action);
    if (code === null) return;
    this.queue.push(code);
    if (want === 'leap' && p.step === 1) {
      this.leapStage = 1;
      this.forcedRelease = { action: 'jump', tick: sim.tick + 14 };
    } else if (want === 'leap' && p.step === 2) {
      this.leapStage = 0;
      this.forcedRelease = { action: 'jump', tick: sim.tick + 20 };
    } else {
      const hold = TUTORIAL_HOLD[action];
      if (hold) this.forcedRelease = { action, tick: sim.tick + hold };
    }
    this.unfreeze();
  }

  /** Elapsed simulated seconds. */
  get seconds(): number {
    return this.sim.tick * DT;
  }
}

function pressCode(action: Action): number | null {
  switch (action) {
    case 'jump':
      return INPUT.JumpDown;
    case 'slide':
      return INPUT.SlideDown;
    case 'dash':
      return INPUT.Dash;
    case 'shield':
      return INPUT.Shield;
    default:
      return null;
  }
}

function releaseCode(action: Action): number | null {
  switch (action) {
    case 'jump':
      return INPUT.JumpUp;
    case 'slide':
      return INPUT.SlideUp;
    default:
      return null;
  }
}
