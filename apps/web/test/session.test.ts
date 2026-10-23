import { describe, expect, it } from 'vitest';
import { replayRun, TUTORIAL_LESSONS, type RunConfig } from '@dbfc/shared';
import { GameSession } from '../src/game/session/GameSession';

const config: RunConfig = {
  seed: 4242,
  difficulty: 'easy',
  stage: 'emerald',
  abilities: { dash: true, leap: true, shield: false },
};

/** Drive a session with a fake clock: `ms` of real time in 16.67 ms frames. */
function advance(session: GameSession, startNow: number, ms: number): number {
  let now = startNow;
  for (let t = 0; t < ms; t += 1000 / 60) {
    now += 1000 / 60;
    session.frame(1000 / 60, now);
  }
  return now;
}

describe('GameSession', () => {
  it('does not advance during the countdown, then steps at 60 Hz', () => {
    const s = new GameSession({ mode: 'solo', config, skin: 'emberscale', startAt: 1000 });
    expect(s.frame(16, 500)).toBe(0);
    expect(s.sim.tick).toBe(0);
    advance(s, 1000, 1000);
    expect(s.sim.tick).toBeGreaterThanOrEqual(59);
    expect(s.sim.tick).toBeLessThanOrEqual(61);
  });

  it('records inputs at the tick they are applied, and the server replay matches exactly', () => {
    const s = new GameSession({
      mode: 'solo',
      config,
      skin: 'emberscale',
      startAt: 0,
      autopilot: true,
    });
    let result: ReturnType<typeof s.sim.result> | null = null;
    let inputs: number[] = [];
    s.on('finish', (r, log) => {
      result = r;
      inputs = log;
    });
    // Mix in some human key presses on top of the autopilot.
    let now = 0;
    for (let frame = 0; frame < 60 * 400 && !s.finished; frame++) {
      if (frame === 300) s.press('dash');
      now += 1000 / 60;
      s.frame(1000 / 60, now);
    }
    expect(result).not.toBeNull();
    expect(inputs.length).toBeGreaterThan(0);
    expect(replayRun(config, inputs)).toEqual(result);
  });

  it('pausing freezes simulated time and releases held keys', () => {
    const s = new GameSession({ mode: 'solo', config, skin: 'emberscale', startAt: 0 });
    let now = advance(s, 0, 500);
    s.press('jump');
    s.pause('user');
    expect(s.paused).toBe(true);
    const tick = s.sim.tick;
    now = advance(s, now, 2000);
    expect(s.sim.tick).toBe(tick);
    s.resume();
    advance(s, now, 500);
    expect(s.sim.tick).toBeGreaterThan(tick);
    expect(s.sim.jumpHeld).toBe(false);
  });

  it('races never pause: the menu opens but the clock keeps running', () => {
    const s = new GameSession({ mode: 'race', config, skin: 'emberscale', startAt: 0 });
    const events: boolean[] = [];
    s.on('pause', (open) => events.push(open));
    s.togglePause();
    expect(s.paused).toBe(false);
    advance(s, 0, 1000);
    expect(s.sim.tick).toBeGreaterThan(50);
    s.togglePause();
    expect(events).toEqual([true, false]);
  });

  it('freezes at each tutorial lesson until the prompted action is performed', () => {
    const s = new GameSession({
      mode: 'tutorial',
      config: { ...config, tutorial: true },
      skin: 'emberscale',
      startAt: 0,
    });
    const prompts: (string | null)[] = [];
    s.on('prompt', (p) => prompts.push(p ? p.lesson.id : null));
    let now = 0;
    const step = (ms: number) => (now = advance(s, now, ms));
    step(8000);
    expect(s.currentPrompt?.lesson.id).toBe(TUTORIAL_LESSONS[0]!.id);
    const frozenAt = s.sim.tick;
    step(1000);
    expect(s.sim.tick).toBe(frozenAt); // frozen
    s.press('slide'); // wrong action is ignored
    expect(s.currentPrompt).not.toBeNull();
    s.press('jump');
    s.release('jump');
    expect(s.currentPrompt).toBeNull();
    step(1500);
    expect(s.sim.stats.hits).toBe(0);
    expect(s.sim.stats.jumps).toBe(1);
    expect(prompts.slice(0, 2)).toEqual(['jump', null]);
  });
});
