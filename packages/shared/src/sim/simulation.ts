/**
 * ChaseSimulation — the authoritative, deterministic game simulation.
 *
 * Contains the CollisionSystem, AbilitySystem, FireballController and scoring.
 * It knows nothing about rendering: the Phaser client renders its state, the
 * server replays recorded inputs through it to verify results, and the
 * autopilot clones it to look ahead.
 *
 * Determinism contract: given the same RunConfig and the same input events
 * applied at the same ticks, every engine produces identical results.
 */
import {
  ABILITIES,
  BOOST,
  CATCH_DISTANCE,
  DRAGON,
  DT,
  ENERGY,
  FIREBALL,
  FLOW,
  HIT,
  MAX_RUN_TICKS,
  MUD,
  PHYSICS,
  SCORE,
  SNARE,
  STUMBLE,
  SWING,
} from './constants';
import {
  generateCourse,
  OBSTACLE_INFO,
  type CollectibleKind,
  type Course,
  type Obstacle,
  type ObstacleKind,
} from './course';
import { DIFFICULTIES, type Difficulty, type DifficultyConfig } from './difficulty';
import { smoothWave } from './math';
import type { StageId } from './stages';

export const INPUT = {
  JumpDown: 1,
  JumpUp: 2,
  SlideDown: 3,
  SlideUp: 4,
  Dash: 5,
  Shield: 6,
} as const;
export type InputCode = (typeof INPUT)[keyof typeof INPUT];
export const INPUT_CODES: readonly number[] = Object.values(INPUT);

export type Outcome = 'caught' | 'escaped' | 'defeated';

export interface AbilityLoadout {
  dash: boolean;
  leap: boolean;
  shield: boolean;
}

export interface RunConfig {
  seed: number;
  difficulty: Difficulty;
  stage: StageId;
  abilities: AbilityLoadout;
  tutorial?: boolean;
}

export type SimEventType =
  | 'jump'
  | 'leap'
  | 'land'
  | 'slide'
  | 'fastFall'
  | 'hit'
  | 'shieldBlock'
  | 'stumble'
  | 'mud'
  | 'pitFall'
  | 'collect'
  | 'clear'
  | 'burn'
  | 'dash'
  | 'dashEnd'
  | 'shieldUp'
  | 'shieldDown'
  | 'boulderRoll'
  | 'flowMax'
  | 'catch'
  | 'escape'
  | 'defeat';

export interface SimEvent {
  type: SimEventType;
  /** Obstacle or collectible id where relevant, otherwise -1. */
  id: number;
  /** Obstacle/collectible kind where relevant, otherwise ''. */
  kind: ObstacleKind | CollectibleKind | '';
  x: number;
  y: number;
}

export interface RunStats {
  points: number;
  orbs: number;
  crystals: number;
  scales: number;
  pickups: number;
  cleared: number;
  hits: number;
  stumbles: number;
  pitFalls: number;
  mudHits: number;
  jumps: number;
  slides: number;
  dashes: number;
  leaps: number;
  shieldsUsed: number;
  shieldBlocks: number;
  thornsBurned: number;
  closestGap: number;
  maxFlow: number;
}

export interface ScoreBreakdown {
  distance: number;
  actions: number;
  catchBonus: number;
  timeBonus: number;
  heartsBonus: number;
  multiplier: number;
}

export interface RunResult extends RunStats {
  outcome: Outcome;
  ticks: number;
  seconds: number;
  score: number;
  distance: number;
  heartsLeft: number;
  breakdown: ScoreBreakdown;
}

/** Obstacle runtime flags. */
const OBS_NONE = 0;
const OBS_HIT = 1;
const OBS_CLEARED = 2;
const OBS_BURNED = 3;
const OBS_SMASHED = 4;
const OBS_PHASED = 5;

const TUTORIAL_CATCH_X = 250;

/** Axis-aligned collision box (absolute metres). */
export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function emptyStats(startGap: number): RunStats {
  return {
    points: 0,
    orbs: 0,
    crystals: 0,
    scales: 0,
    pickups: 0,
    cleared: 0,
    hits: 0,
    stumbles: 0,
    pitFalls: 0,
    mudHits: 0,
    jumps: 0,
    slides: 0,
    dashes: 0,
    leaps: 0,
    shieldsUsed: 0,
    shieldBlocks: 0,
    thornsBurned: 0,
    closestGap: startGap,
    maxFlow: 0,
  };
}

export class ChaseSimulation {
  readonly course: Course;
  readonly config: RunConfig;
  readonly diff: DifficultyConfig;

  tick = 0;

  // --- Dragon -------------------------------------------------------------
  x = 0;
  y = 0;
  vy = 0;
  prevX = 0;
  prevY = 0;
  speed: number;
  grounded = true;
  sliding = false;
  slideTicks = 0;
  slideHeld = false;
  jumpHeld = false;
  rising = false;
  jumpHoldTicks = 0;
  coyote = 0;
  jumpBuffer = 0;
  airLeapUsed = false;
  rescue = false;
  inMud = false;
  hearts: number;
  maxHearts: number;
  energy: number = ENERGY.start;
  flow = 0;
  dashTicks = 0;
  dashReadyAt = 0;
  leapReadyAt = 0;
  shieldTicks = 0;
  shieldReadyAt = 0;
  invulnTicks = 0;
  stumbleTicks = 0;
  boostTicks = 0;
  /** Tick of the most recent jump/leap/land, for animation. */
  lastJumpTick = -999;
  lastLandTick = -999;
  lastHitTick = -999;

  // --- Fireball -----------------------------------------------------------
  fbX: number;
  prevFbX: number;
  fbSpeed = 0;

  // --- Outcome & stats ----------------------------------------------------
  outcome: Outcome | null = null;
  endTick = 0;
  stats: RunStats;
  private finalScore = 0;
  private breakdown: ScoreBreakdown = {
    distance: 0,
    actions: 0,
    catchBonus: 0,
    timeBonus: 0,
    heartsBonus: 0,
    multiplier: 1,
  };

  // --- Runtime course state -------------------------------------------------
  obsState: Uint8Array;
  obsX: Float64Array;
  obsActive: Uint8Array;
  colTaken: Uint8Array;
  private obsCursor = 0;
  private colCursor = 0;
  private pitCursor = 0;

  /** One-shot events produced during the most recent step (cleared each step). */
  events: SimEvent[] = [];
  /** When false, events are not recorded (used by autopilot look-ahead). */
  recordEvents = true;

  private pending: number[] = [];
  private slideRequest = false;
  private dashRequest = false;
  private shieldRequest = false;
  private flowMaxAnnounced = false;

  constructor(config: RunConfig, course?: Course) {
    this.config = config;
    this.course =
      course ??
      generateCourse({
        seed: config.seed,
        difficulty: config.difficulty,
        stage: config.stage,
        tutorial: config.tutorial,
      });
    this.diff = DIFFICULTIES[config.difficulty];
    this.speed = this.diff.baseSpeed * 0.85;
    this.hearts = config.tutorial ? 5 : this.diff.hearts;
    this.maxHearts = this.hearts;
    this.fbX = this.course.startGap;
    this.prevFbX = this.fbX;
    this.stats = emptyStats(this.course.startGap);
    const n = this.course.obstacles.length;
    this.obsState = new Uint8Array(n);
    this.obsX = new Float64Array(n);
    this.obsActive = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.obsX[i] = this.course.obstacles[i]!.x;
    this.colTaken = new Uint8Array(this.course.collectibles.length);
  }

  /** Queue an input event; it is applied at the start of the next `step()`. */
  input(code: number): void {
    this.pending.push(code);
  }

  get gap(): number {
    return this.fbX - this.x;
  }

  get over(): boolean {
    return this.outcome !== null;
  }

  get dashReady(): boolean {
    return (
      this.config.abilities.dash &&
      this.dashTicks === 0 &&
      this.tick >= this.dashReadyAt &&
      this.energy >= ABILITIES.dash.energyCost
    );
  }

  get leapReady(): boolean {
    return this.config.abilities.leap && this.tick >= this.leapReadyAt;
  }

  get shieldReady(): boolean {
    return (
      this.config.abilities.shield && this.shieldTicks === 0 && this.tick >= this.shieldReadyAt
    );
  }

  /** Advance the simulation by exactly one tick. */
  step(): void {
    if (this.outcome) return;
    if (this.events.length) this.events.length = 0;
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevFbX = this.fbX;

    this.processInputs();
    this.updateAbilities();
    this.updateSpeed();
    this.x += this.speed * DT;
    this.updateVertical();
    this.updateSlide();
    if (!this.outcome) this.updateObstacles();
    if (!this.outcome) this.updateCollectibles();
    if (!this.outcome) this.updateFireball();
    this.tick++;
    if (!this.outcome && this.tick >= MAX_RUN_TICKS) this.finish('escaped');
  }

  // -------------------------------------------------------------------------

  private emit(type: SimEventType, id = -1, kind: SimEvent['kind'] = '', x = this.x, y = this.y) {
    if (this.recordEvents) this.events.push({ type, id, kind, x, y });
  }

  private processInputs(): void {
    const p = this.pending;
    for (let i = 0; i < p.length; i++) {
      switch (p[i]) {
        case INPUT.JumpDown:
          if (!this.jumpHeld) {
            this.jumpHeld = true;
            this.jumpBuffer = PHYSICS.jumpBufferTicks;
          }
          break;
        case INPUT.JumpUp:
          this.jumpHeld = false;
          break;
        case INPUT.SlideDown:
          if (!this.slideHeld) {
            this.slideHeld = true;
            this.slideRequest = true;
          }
          break;
        case INPUT.SlideUp:
          this.slideHeld = false;
          break;
        case INPUT.Dash:
          this.dashRequest = true;
          break;
        case INPUT.Shield:
          this.shieldRequest = true;
          break;
        default:
          break;
      }
    }
    if (p.length) p.length = 0;
  }

  private updateAbilities(): void {
    const t = this.tick;
    if (this.dashRequest) {
      this.dashRequest = false;
      if (this.dashReady) {
        this.energy -= ABILITIES.dash.energyCost;
        this.dashTicks = ABILITIES.dash.durationTicks;
        this.stats.dashes++;
        this.emit('dash');
      }
    }
    if (this.shieldRequest) {
      this.shieldRequest = false;
      if (this.shieldReady) {
        this.shieldTicks = ABILITIES.shield.durationTicks;
        this.shieldReadyAt = t + ABILITIES.shield.cooldownTicks;
        this.stats.shieldsUsed++;
        this.emit('shieldUp');
      }
    }
    if (this.dashTicks > 0) {
      this.dashTicks--;
      if (this.dashTicks === 0) {
        this.dashReadyAt = t + ABILITIES.dash.cooldownTicks;
        this.emit('dashEnd');
      }
    }
    if (this.shieldTicks > 0) {
      this.shieldTicks--;
      if (this.shieldTicks === 0) this.emit('shieldDown');
    }
    if (this.invulnTicks > 0) this.invulnTicks--;
    if (this.stumbleTicks > 0) this.stumbleTicks--;
    if (this.boostTicks > 0) this.boostTicks--;
  }

  private ramp(): number {
    const seconds = this.tick * DT;
    return 1 + Math.min(this.diff.rampMax, seconds * this.diff.rampPerSecond);
  }

  private updateSpeed(): void {
    let target = this.diff.baseSpeed * this.ramp() * (1 + this.flow * FLOW.speedPerLevel);
    if (this.dashTicks > 0) target *= ABILITIES.dash.speedMult;
    else if (this.boostTicks > 0) target *= BOOST.speedMult;
    if (this.inMud && this.grounded) target *= MUD.speedFactor;
    if (this.stumbleTicks > 0) target *= STUMBLE.speedFactor;
    this.speed += (target - this.speed) * PHYSICS.speedResponse;
  }

  private overPit(x: number): boolean {
    const p = this.course.pits;
    while (this.pitCursor < p.length && p[this.pitCursor + 1]! < x - 2) this.pitCursor += 2;
    for (let i = this.pitCursor; i < p.length; i += 2) {
      const x0 = p[i]!;
      if (x0 > x) return false;
      if (x - DRAGON.footHalfWidth >= x0 && x + DRAGON.footHalfWidth <= p[i + 1]!) return true;
    }
    return false;
  }

  private groundHere(): number {
    const xs = this.course.terrainX;
    const hs = this.course.terrainH;
    const x = this.x;
    let lo = 0;
    let hi = xs.length - 1;
    if (x <= xs[0]!) return hs[0]!;
    if (x >= xs[hi]!) return hs[hi]!;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid]! <= x) lo = mid;
      else hi = mid;
    }
    const t = (x - xs[lo]!) / (xs[hi]! - xs[lo]!);
    return hs[lo]! + (hs[hi]! - hs[lo]!) * t;
  }

  private doJump(velocity: number): void {
    this.vy = velocity;
    this.grounded = false;
    this.rising = true;
    this.jumpHoldTicks = 0;
    this.sliding = false;
    this.lastJumpTick = this.tick;
  }

  private updateVertical(): void {
    const g = this.groundHere();
    if (this.grounded) {
      if (!this.rescue && this.overPit(this.x)) {
        this.grounded = false;
        this.coyote = PHYSICS.coyoteTicks;
        this.vy = 0;
        this.rising = false;
      } else {
        this.y = g;
      }
    }

    if (this.jumpBuffer > 0) {
      if (this.grounded || this.coyote > 0) {
        this.doJump(PHYSICS.jumpVelocity);
        this.jumpBuffer = 0;
        this.coyote = 0;
        this.airLeapUsed = false;
        this.stats.jumps++;
        this.emit('jump');
      } else if (
        this.config.abilities.leap &&
        !this.airLeapUsed &&
        !this.rescue &&
        this.tick >= this.leapReadyAt
      ) {
        this.doJump(PHYSICS.leapVelocity);
        this.airLeapUsed = true;
        this.leapReadyAt = this.tick + ABILITIES.leap.cooldownTicks;
        this.jumpBuffer = 0;
        this.stats.leaps++;
        this.emit('leap');
      } else {
        this.jumpBuffer--;
      }
    }

    if (!this.grounded) {
      if (this.coyote > 0) this.coyote--;
      let gravity: number = PHYSICS.gravityFall;
      if (this.rising) {
        this.jumpHoldTicks++;
        if (this.vy <= 0) {
          this.rising = false;
        } else if (!this.jumpHeld && this.jumpHoldTicks >= PHYSICS.minJumpHoldTicks) {
          this.vy *= PHYSICS.jumpCutFactor;
          this.rising = false;
        } else {
          gravity = PHYSICS.gravityRise;
        }
      }
      if (this.slideRequest && !this.rescue) {
        if (this.vy > PHYSICS.fastFallVelocity) this.vy = PHYSICS.fastFallVelocity;
        this.rising = false;
        this.emit('fastFall');
      }
      this.vy -= gravity * DT;
      if (this.vy < PHYSICS.maxFallSpeed) this.vy = PHYSICS.maxFallSpeed;
      this.y += this.vy * DT;

      const pit = !this.rescue && this.overPit(this.x);
      if (!pit && this.y <= g && this.vy <= 0) {
        this.land(g);
      } else if (pit && this.y < g - PHYSICS.pitFallDepth) {
        this.pitFall(g);
      } else if (this.rescue && this.y <= g && this.vy <= 0) {
        this.land(g);
      }
    }
    if (this.rescue && this.grounded && !this.overPit(this.x)) this.rescue = false;
  }

  private land(g: number): void {
    this.y = g;
    this.vy = 0;
    this.grounded = true;
    this.rising = false;
    this.airLeapUsed = false;
    this.lastLandTick = this.tick;
    this.emit('land');
  }

  private pitFall(g: number): void {
    this.stats.pitFalls++;
    const obs = this.course.obstacles;
    for (let i = this.obsCursor; i < obs.length; i++) {
      const o = obs[i]!;
      if (o.x > this.x) break;
      if (o.kind === 'gap' && this.x >= o.x && this.x <= o.x + o.w) this.obsState[i] = OBS_HIT;
    }
    if (this.shieldTicks > 0) {
      this.shieldTicks = 0;
      this.stats.shieldBlocks++;
      this.emit('shieldBlock', -1, 'gap');
    } else {
      this.damage();
      this.emit('pitFall', -1, 'gap');
    }
    this.invulnTicks = HIT.invulnTicks;
    this.rescue = true;
    this.vy = PHYSICS.rescueVelocity;
    this.rising = false;
    this.speed *= 0.75;
    this.dashTicks = 0;
    if (this.y < g - PHYSICS.pitFallDepth - 0.4) this.y = g - PHYSICS.pitFallDepth - 0.4;
  }

  private updateSlide(): void {
    if (this.slideRequest) {
      if (this.grounded && !this.sliding) this.startSlide();
    } else if (
      this.grounded &&
      !this.sliding &&
      this.slideHeld &&
      this.lastLandTick === this.tick
    ) {
      // Landing while holding slide flows straight into a slide.
      this.startSlide();
    }
    this.slideRequest = false;
    if (this.sliding) {
      this.slideTicks++;
      if (!this.grounded) this.sliding = false;
      else if (this.slideTicks >= PHYSICS.slideMaxTicks) this.sliding = false;
      else if (!this.slideHeld && this.slideTicks >= PHYSICS.slideBaseTicks) this.sliding = false;
    }
  }

  private startSlide(): void {
    this.sliding = true;
    this.slideTicks = 0;
    this.stats.slides++;
    this.emit('slide');
  }

  /** Current collision box of an obstacle (written into `out`). Returns false if inactive. */
  obstacleBox(index: number, tick: number, out: Box): boolean {
    const o = this.course.obstacles[index]!;
    switch (o.kind) {
      case 'swing': {
        const s = smoothWave((tick + o.phase) / o.period);
        out.x0 = o.x;
        out.x1 = o.x + o.w;
        out.y0 = o.ground + SWING.lowBottom + SWING.lift * s * s;
        out.y1 = out.y0 + SWING.logHeight;
        return true;
      }
      case 'snare': {
        out.x0 = o.x;
        out.x1 = o.x + o.w;
        out.y0 = o.ground;
        out.y1 = o.ground + SNARE.activeHeight;
        return snarePhase(o, tick) === 'active';
      }
      case 'boulder': {
        const bx = this.obsX[index]!;
        out.x0 = bx;
        out.x1 = bx + o.w;
        out.y0 = o.ground + o.y0;
        out.y1 = o.ground + o.y1;
        return true;
      }
      default:
        out.x0 = o.x;
        out.x1 = o.x + o.w;
        out.y0 = o.ground + o.y0;
        out.y1 = o.ground + o.y1;
        return true;
    }
  }

  private readonly box: Box = { x0: 0, x1: 0, y0: 0, y1: 0 };

  private updateObstacles(): void {
    const obs = this.course.obstacles;
    const half = this.sliding ? DRAGON.slideHalfWidth : DRAGON.standHalfWidth;
    const height = this.sliding ? DRAGON.slideHeight : DRAGON.standHeight;
    const left = this.x - half;
    const right = this.x + half;
    const bottom = this.y;
    const top = this.y + height;
    const clearLine = this.x - DRAGON.standHalfWidth;
    const box = this.box;
    let mud = false;

    while (this.obsCursor < obs.length) {
      const o = obs[this.obsCursor]!;
      if (o.x + o.w < clearLine - 6 && this.obsState[this.obsCursor] !== OBS_NONE) this.obsCursor++;
      else break;
    }

    for (let i = this.obsCursor; i < obs.length; i++) {
      const o = obs[i]!;
      if (o.x > this.x + 45) break;
      const state = this.obsState[i]!;

      if (o.kind === 'boulder') {
        if (!this.obsActive[i] && o.x - this.x <= o.trigger) {
          this.obsActive[i] = 1;
          this.emit('boulderRoll', o.id, 'boulder', o.x, o.ground);
        }
        if (this.obsActive[i] && this.obsX[i]! > o.stopX) {
          this.obsX[i] = Math.max(o.stopX, this.obsX[i]! - o.speed * DT);
        }
      }

      if (state !== OBS_NONE) continue;

      const regionEnd = o.kind === 'boulder' ? this.obsX[i]! + o.w : o.x + o.w;
      if (regionEnd < clearLine) {
        this.obsState[i] = OBS_CLEARED;
        this.onCleared(o);
        continue;
      }

      if (o.kind === 'gap') continue;
      if (o.kind === 'mud') {
        if (
          this.grounded &&
          this.x + DRAGON.footHalfWidth > o.x &&
          this.x - DRAGON.footHalfWidth < o.x + o.w
        ) {
          mud = true;
          if (!this.inMud) {
            this.stats.mudHits++;
            this.flow = Math.max(0, this.flow - FLOW.mudPenalty);
            this.emit('mud', o.id, 'mud');
          }
          // Remember that it was touched (not cleared), but keep slowing while inside.
          this.obsState[i] = OBS_HIT;
        }
        continue;
      }

      if (!this.obstacleBox(i, this.tick, box)) continue;
      if (right > box.x0 && left < box.x1 && top > box.y0 && bottom < box.y1) {
        this.collide(i, o);
        if (this.outcome) return;
      }
    }

    // Mud keeps slowing while the dragon remains inside an already-touched patch.
    if (!mud && this.grounded) {
      for (let i = this.obsCursor; i < obs.length; i++) {
        const o = obs[i]!;
        if (o.x > this.x + 2) break;
        if (
          o.kind === 'mud' &&
          this.x + DRAGON.footHalfWidth > o.x &&
          this.x - DRAGON.footHalfWidth < o.x + o.w
        ) {
          mud = true;
          break;
        }
      }
    }
    this.inMud = mud;
  }

  private onCleared(o: Obstacle): void {
    this.stats.cleared++;
    this.stats.points += Math.floor(SCORE.clearBase + this.flow * SCORE.clearFlowBonus);
    this.addFlow(FLOW.perClear);
    this.emit('clear', o.id, o.kind, o.x + o.w / 2, o.ground);
  }

  private addFlow(amount: number): void {
    this.flow = Math.min(FLOW.max, this.flow + amount);
    if (this.flow > this.stats.maxFlow) this.stats.maxFlow = this.flow;
    if (!this.flowMaxAnnounced && this.flow >= FLOW.max) {
      this.flowMaxAnnounced = true;
      this.emit('flowMax');
    }
  }

  private collide(index: number, o: Obstacle): void {
    const effect = OBSTACLE_INFO[o.kind].effect;
    if (effect === 'stumble') {
      if (this.invulnTicks > 0) {
        this.obsState[index] = OBS_PHASED;
        return;
      }
      this.obsState[index] = OBS_HIT;
      this.stumbleTicks = STUMBLE.ticks;
      this.flow = Math.max(0, this.flow - FLOW.stumblePenalty);
      this.stats.stumbles++;
      this.emit('stumble', o.id, o.kind);
      return;
    }

    if (o.kind === 'thorns' && this.dashTicks > 0) {
      this.obsState[index] = OBS_BURNED;
      this.stats.thornsBurned++;
      this.stats.points += SCORE.thornBurn;
      this.addFlow(FLOW.perClear);
      this.emit('burn', o.id, o.kind, o.x + o.w / 2, o.ground);
      return;
    }
    if (this.invulnTicks > 0) {
      this.obsState[index] = OBS_PHASED;
      return;
    }
    if (this.shieldTicks > 0) {
      this.shieldTicks = 0;
      this.invulnTicks = HIT.shieldInvulnTicks;
      this.stats.shieldBlocks++;
      this.obsState[index] = OBS_SMASHED;
      this.emit('shieldBlock', o.id, o.kind);
      return;
    }
    this.obsState[index] = OBS_HIT;
    this.speed *= HIT.speedFactor;
    this.dashTicks = 0;
    this.invulnTicks = HIT.invulnTicks;
    this.damage();
    this.emit('hit', o.id, o.kind);
  }

  private damage(): void {
    this.stats.hits++;
    this.flow = 0;
    this.lastHitTick = this.tick;
    if (this.config.tutorial) {
      this.hearts = Math.max(1, this.hearts - 1);
      return;
    }
    this.hearts--;
    if (this.hearts <= 0) {
      this.hearts = 0;
      this.finish('defeated');
    }
  }

  private updateCollectibles(): void {
    const cols = this.course.collectibles;
    const half = this.sliding ? DRAGON.slideHalfWidth : DRAGON.standHalfWidth;
    const height = this.sliding ? DRAGON.slideHeight : DRAGON.standHeight;
    const pad = DRAGON.pickupPadding;
    const left = this.x - half - pad;
    const right = this.x + half + pad;
    const bottom = this.y - pad;
    const top = this.y + height + pad;
    while (this.colCursor < cols.length && cols[this.colCursor]!.x < left - 1) this.colCursor++;
    for (let i = this.colCursor; i < cols.length; i++) {
      const c = cols[i]!;
      if (c.x > right) break;
      if (this.colTaken[i]) continue;
      if (c.x >= left && c.y >= bottom && c.y <= top) {
        this.colTaken[i] = 1;
        this.collect(c.id, c.kind, c.x, c.y);
      }
    }
  }

  private collect(id: number, kind: CollectibleKind, x: number, y: number): void {
    const s = this.stats;
    switch (kind) {
      case 'orb':
        s.orbs++;
        s.points += SCORE.orb;
        this.energy = Math.min(ENERGY.max, this.energy + ENERGY.orb);
        this.addFlow(FLOW.perOrb);
        break;
      case 'crystal':
        s.crystals++;
        s.points += SCORE.crystal;
        this.energy = Math.min(ENERGY.max, this.energy + ENERGY.crystal);
        break;
      case 'scale':
        s.scales++;
        s.points += SCORE.scale;
        break;
      case 'shield':
        s.pickups++;
        s.points += SCORE.pickup;
        this.shieldTicks = ABILITIES.shield.durationTicks;
        this.emit('shieldUp');
        break;
      case 'boost':
        s.pickups++;
        s.points += SCORE.pickup;
        this.boostTicks = BOOST.ticks;
        break;
    }
    this.emit('collect', id, kind, x, y);
  }

  private updateFireball(): void {
    const d = this.diff;
    const seconds = this.tick * DT;
    const gap = this.fbX - this.x;
    let factor = d.fireballFactor;
    if (this.config.tutorial) {
      factor = this.x < TUTORIAL_CATCH_X ? 1.04 : 0.9;
    } else {
      const excess = gap - this.course.startGap;
      if (excess > FIREBALL.rubberBandSlack) {
        factor -=
          FIREBALL.rubberBandMax *
          Math.min(1, (excess - FIREBALL.rubberBandSlack) / FIREBALL.rubberBandRange);
      }
      factor -= Math.min(FIREBALL.fatigueMax, seconds * FIREBALL.fatiguePerSecond);
    }
    if (gap < FIREBALL.corneredGap)
      factor += FIREBALL.corneredBoost * (1 - gap / FIREBALL.corneredGap);
    this.fbSpeed = d.baseSpeed * this.ramp() * factor;
    this.fbX += this.fbSpeed * DT;
    if (this.config.tutorial && this.x < TUTORIAL_CATCH_X && this.fbX - this.x < 12) {
      this.fbX = this.x + 12;
    }

    const newGap = this.fbX - this.x;
    if (newGap < this.stats.closestGap) this.stats.closestGap = newGap;
    if (newGap <= CATCH_DISTANCE) this.finish('caught');
    else if (this.fbX >= this.course.length) this.finish('escaped');
  }

  private finish(outcome: Outcome): void {
    if (this.outcome) return;
    this.outcome = outcome;
    this.endTick = this.tick + 1;
    const d = this.diff;
    const distance = Math.floor(this.x);
    let catchBonus = 0;
    let timeBonus = 0;
    let heartsBonus = 0;
    if (outcome === 'caught') {
      catchBonus = SCORE.catchBonus;
      const seconds = this.endTick * DT;
      timeBonus = Math.max(0, Math.floor((d.parSeconds - seconds) * SCORE.timeBonusPerSecond));
      heartsBonus = this.hearts * SCORE.heartBonus;
    }
    const raw = this.stats.points + distance + catchBonus + timeBonus + heartsBonus;
    const multiplier = this.config.tutorial ? 1 : d.scoreMultiplier;
    this.finalScore = Math.floor(raw * multiplier);
    this.breakdown = {
      distance,
      actions: this.stats.points,
      catchBonus,
      timeBonus,
      heartsBonus,
      multiplier,
    };
    this.emit(outcome === 'caught' ? 'catch' : outcome === 'escaped' ? 'escape' : 'defeat');
  }

  /** Final (or provisional, if still running) result. */
  result(): RunResult {
    const ticks = this.outcome ? this.endTick : this.tick;
    return {
      ...this.stats,
      outcome: this.outcome ?? 'escaped',
      ticks,
      seconds: Math.round(ticks * DT * 1000) / 1000,
      score: this.outcome ? this.finalScore : this.provisionalScore(),
      distance: Math.floor(this.x),
      heartsLeft: this.hearts,
      breakdown: { ...this.breakdown },
    };
  }

  /** Running score shown in the HUD while the chase is in progress. */
  provisionalScore(): number {
    if (this.outcome) return this.finalScore;
    const multiplier = this.config.tutorial ? 1 : this.diff.scoreMultiplier;
    return Math.floor((this.stats.points + Math.floor(this.x)) * multiplier);
  }

  /** Cheap structural copy for look-ahead (shares the immutable course). */
  clone(): ChaseSimulation {
    const c = Object.create(ChaseSimulation.prototype) as ChaseSimulation;
    Object.assign(c, this);
    c.obsState = this.obsState.slice();
    c.obsX = this.obsX.slice();
    c.obsActive = this.obsActive.slice();
    c.colTaken = this.colTaken.slice();
    c.stats = { ...this.stats };
    c.events = [];
    c.pending = this.pending.slice();
    (c as unknown as { box: Box }).box = { x0: 0, x1: 0, y0: 0, y1: 0 };
    return c;
  }

  /** Compact digest of the full state — used by determinism tests. */
  digest(): string {
    const parts = [
      this.tick,
      this.x,
      this.y,
      this.vy,
      this.speed,
      this.fbX,
      this.hearts,
      this.energy,
      this.flow,
      this.stats.points,
      this.stats.cleared,
      this.stats.hits,
    ];
    let h = 0x811c9dc5;
    const view = new DataView(new ArrayBuffer(8));
    for (const v of parts) {
      view.setFloat64(0, v);
      for (let i = 0; i < 8; i++) {
        h ^= view.getUint8(i);
        h = Math.imul(h, 0x01000193);
      }
    }
    for (let i = 0; i < this.obsState.length; i++) {
      h ^= this.obsState[i]!;
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }
}

export type SnarePhase = 'dormant' | 'warning' | 'active';

/** Snare phase at a given tick (pure function of time — safe for rendering too). */
export function snarePhase(o: Obstacle, tick: number): SnarePhase {
  const p = (tick + o.phase) % o.period;
  if (p >= o.period - SNARE.activeTicks) return 'active';
  if (p >= o.period - SNARE.activeTicks - SNARE.warningTicks) return 'warning';
  return 'dormant';
}

/**
 * Swing log pose at a (possibly fractional) tick — for rendering. `s` in [-1, 1]
 * is the swing position (negative = away from the camera, positive = toward it).
 */
export function swingPose(o: Obstacle, tick: number): { bottom: number; s: number } {
  const s = smoothWave((tick + o.phase) / o.period);
  return { bottom: o.ground + SWING.lowBottom + SWING.lift * s * s, s };
}
