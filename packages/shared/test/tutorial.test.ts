import { describe, expect, it } from 'vitest';
import { ChaseSimulation, INPUT, TUTORIAL_LESSONS } from '../src/index';

/**
 * Mirrors the tutorial scene: time freezes at each lesson; the player's action
 * is applied with a forgiving minimum hold. Every lesson must succeed.
 */
describe('tutorial course', () => {
  it('every lesson succeeds when the prompted action is performed', () => {
    const sim = new ChaseSimulation({
      seed: 1,
      difficulty: 'easy',
      stage: 'emerald',
      abilities: { dash: true, leap: true, shield: false },
      tutorial: true,
    });
    const scheduled: [number, number][] = [];
    let lesson = 0;
    let leapPending = false;
    while (!sim.over && sim.tick < 60 * 120) {
      const next = TUTORIAL_LESSONS[lesson];
      if (next && sim.x >= next.x) {
        lesson++;
        if (next.action === 'jump')
          scheduled.push([sim.tick, INPUT.JumpDown], [sim.tick + 20, INPUT.JumpUp]);
        if (next.action === 'slide')
          scheduled.push([sim.tick, INPUT.SlideDown], [sim.tick + 60, INPUT.SlideUp]);
        if (next.action === 'dash') scheduled.push([sim.tick, INPUT.Dash]);
        if (next.action === 'leap') {
          scheduled.push([sim.tick, INPUT.JumpDown], [sim.tick + 14, INPUT.JumpUp]);
          leapPending = true;
        }
      }
      if (leapPending && !sim.grounded && sim.vy <= 1 && sim.tick > 0) {
        leapPending = false;
        scheduled.push([sim.tick, INPUT.JumpDown], [sim.tick + 20, INPUT.JumpUp]);
      }
      for (const [tick, code] of scheduled) if (tick === sim.tick) sim.input(code);
      sim.step();
      if (sim.x < 250) {
        expect({ x: Math.round(sim.x), hits: sim.stats.hits, falls: sim.stats.pitFalls }).toEqual({
          x: Math.round(sim.x),
          hits: 0,
          falls: 0,
        });
      }
    }
    expect(lesson).toBe(TUTORIAL_LESSONS.length);
    expect(sim.stats.thornsBurned).toBe(1);
    expect(sim.stats.leaps).toBe(1);
    expect(sim.stats.crystals).toBeGreaterThanOrEqual(2);
    expect(sim.outcome).toBe('caught');
  });
});
