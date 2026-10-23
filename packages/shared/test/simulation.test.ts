import { describe, expect, it } from 'vitest';
import {
  ABILITIES,
  ChaseSimulation,
  DIFFICULTIES,
  ENERGY,
  INPUT,
  PHYSICS,
  SCORE,
} from '../src/index';
import { flatCourse, makeSim, obstacle, stepN, stepUntil } from './helpers';

function maxHeight(sim: ChaseSimulation, ticks: number): number {
  let max = 0;
  for (let i = 0; i < ticks; i++) {
    sim.step();
    max = Math.max(max, sim.y);
  }
  return max;
}

describe('dragon movement', () => {
  it('reaches ~2 m with a held jump and ~1.1 m with a tap', () => {
    const held = makeSim(flatCourse());
    stepN(held, 30);
    held.input(INPUT.JumpDown);
    const full = maxHeight(held, 60);
    expect(full).toBeGreaterThan(1.85);
    expect(full).toBeLessThan(2.05);

    const tap = makeSim(flatCourse());
    stepN(tap, 30);
    tap.input(INPUT.JumpDown);
    tap.step();
    tap.input(INPUT.JumpUp);
    const short = maxHeight(tap, 60);
    expect(short).toBeGreaterThan(0.9);
    expect(short).toBeLessThan(1.2);
  });

  it('buffers a jump pressed shortly before landing', () => {
    const sim = makeSim(flatCourse());
    stepN(sim, 10);
    sim.input(INPUT.JumpDown);
    sim.step();
    sim.input(INPUT.JumpUp);
    stepUntil(sim, (s) => s.vy < 0 && s.y < 0.15);
    const jumpsBefore = sim.stats.jumps;
    sim.input(INPUT.JumpDown); // pressed while still airborne (leap disabled below)
    // Disable leap for this check by exhausting it.
    sim.leapReadyAt = sim.tick + 1000;
    stepN(sim, PHYSICS.jumpBufferTicks);
    expect(sim.stats.jumps).toBe(jumpsBefore + 1);
  });

  it('allows a coyote-time jump after running off a ledge', () => {
    const sim = makeSim(flatCourse([obstacle('gap', 20, 4, -12, 0)]));
    stepUntil(sim, (s) => !s.grounded);
    expect(sim.x).toBeGreaterThan(20);
    stepN(sim, 3);
    sim.input(INPUT.JumpDown);
    sim.step();
    expect(sim.vy).toBeGreaterThan(5);
    expect(sim.stats.jumps).toBe(1);
  });

  it('slides under low branches but collides when standing', () => {
    const branch = () => flatCourse([obstacle('branch', 30, 2.4, 1.0, 3.9)]);
    const standing = makeSim(branch());
    stepUntil(standing, (s) => s.x > 35);
    expect(standing.stats.hits).toBe(1);

    const sliding = makeSim(branch());
    stepUntil(sliding, (s) => s.x > 25);
    sliding.input(INPUT.SlideDown);
    stepUntil(sliding, (s) => s.x > 35);
    expect(sliding.stats.hits).toBe(0);
    expect(sliding.stats.cleared).toBe(1);
  });

  it('jumping clears a log and awards clear points and flow', () => {
    const sim = makeSim(flatCourse([obstacle('log', 30, 1.4, 0, 0.8)]));
    stepUntil(sim, (s) => s.x > 26.5);
    sim.input(INPUT.JumpDown);
    stepUntil(sim, (s) => s.x > 40);
    expect(sim.stats.hits).toBe(0);
    expect(sim.stats.cleared).toBe(1);
    expect(sim.flow).toBeGreaterThan(0);
    expect(sim.stats.points).toBeGreaterThanOrEqual(SCORE.clearBase);
  });
});

describe('hazards and abilities', () => {
  it('a hit costs a heart, slows the dragon and grants brief invulnerability', () => {
    const sim = makeSim(
      flatCourse([obstacle('rock', 30, 1, 0, 0.6), obstacle('rock', 33, 1, 0, 0.6)]),
    );
    stepUntil(sim, (s) => s.stats.hits > 0);
    const hearts = sim.hearts;
    expect(hearts).toBe(DIFFICULTIES.medium.hearts - 1);
    expect(sim.invulnTicks).toBeGreaterThan(0);
    stepUntil(sim, (s) => s.x > 40);
    expect(sim.hearts).toBe(hearts); // second rock passed while invulnerable
  });

  it('Fire Dash burns through thorns and consumes energy', () => {
    const sim = makeSim(flatCourse([obstacle('thorns', 40, 2.4, 0, 0.75)]));
    stepUntil(sim, (s) => s.x > 33);
    expect(sim.energy).toBe(ENERGY.start);
    sim.input(INPUT.Dash);
    sim.step();
    expect(sim.dashTicks).toBeGreaterThan(0);
    expect(sim.energy).toBe(ENERGY.start - ABILITIES.dash.energyCost);
    stepUntil(sim, (s) => s.x > 46);
    expect(sim.stats.hits).toBe(0);
    expect(sim.stats.thornsBurned).toBe(1);
  });

  it('Fire Dash cannot be used without enough energy', () => {
    const sim = makeSim(flatCourse());
    sim.energy = ABILITIES.dash.energyCost - 1;
    sim.input(INPUT.Dash);
    sim.step();
    expect(sim.dashTicks).toBe(0);
  });

  it('Dragon Shield absorbs one hit', () => {
    const sim = makeSim(flatCourse([obstacle('trunk', 40, 1.2, 0, 1.3)]));
    sim.input(INPUT.Shield);
    sim.step();
    expect(sim.shieldTicks).toBeGreaterThan(0);
    stepUntil(sim, (s) => s.x > 45);
    expect(sim.stats.hits).toBe(0);
    expect(sim.stats.shieldBlocks).toBe(1);
    expect(sim.hearts).toBe(DIFFICULTIES.medium.hearts);
  });

  it('Dragon Shield is unavailable until unlocked', () => {
    const sim = makeSim(flatCourse(), { abilities: { dash: true, leap: true, shield: false } });
    sim.input(INPUT.Shield);
    sim.step();
    expect(sim.shieldTicks).toBe(0);
  });

  it('Forest Leap gives a second jump in mid-air', () => {
    const sim = makeSim(flatCourse());
    stepN(sim, 10);
    sim.input(INPUT.JumpDown);
    stepN(sim, 20);
    sim.input(INPUT.JumpUp);
    sim.step();
    sim.input(INPUT.JumpDown);
    sim.step();
    expect(sim.stats.leaps).toBe(1);
    const peak = maxHeight(sim, 60);
    expect(peak).toBeGreaterThan(3.2);
  });

  it('falling into a gap costs a heart and the dragon flaps back out', () => {
    const sim = makeSim(flatCourse([obstacle('gap', 30, 4, -12, 0)]));
    stepUntil(sim, (s) => s.x > 45);
    expect(sim.stats.pitFalls).toBe(1);
    expect(sim.hearts).toBe(DIFFICULTIES.medium.hearts - 1);
    expect(sim.grounded).toBe(true);
    expect(sim.y).toBeCloseTo(0, 5);
  });

  it('mud slows the dragon and reduces flow', () => {
    const sim = makeSim(flatCourse([obstacle('mud', 30, 6, 0, 0.12)]));
    stepUntil(sim, (s) => s.x > 29);
    const before = sim.speed;
    stepUntil(sim, (s) => s.x > 34);
    expect(sim.inMud).toBe(true);
    expect(sim.speed).toBeLessThan(before * 0.85);
    expect(sim.stats.mudHits).toBe(1);
  });

  it('roots make the dragon stumble without costing hearts', () => {
    const sim = makeSim(flatCourse([obstacle('roots', 30, 2, 0, 0.38)]));
    stepUntil(sim, (s) => s.x > 35);
    expect(sim.stats.stumbles).toBe(1);
    expect(sim.hearts).toBe(DIFFICULTIES.medium.hearts);
  });
});

describe('chase outcomes', () => {
  it('catches the fireball when the gap closes and awards the catch bonus', () => {
    const sim = makeSim(flatCourse([], { startGap: 6 }));
    sim.flow = 10; // a clean run at full Flow out-paces the fireball
    stepUntil(sim, (s) => s.over, 60 * 120);
    expect(sim.outcome).toBe('caught');
    const r = sim.result();
    expect(r.breakdown.catchBonus).toBe(SCORE.catchBonus);
    expect(r.breakdown.heartsBonus).toBe(DIFFICULTIES.medium.hearts * SCORE.heartBonus);
    expect(r.score).toBe(
      Math.floor(
        (r.points +
          r.breakdown.distance +
          r.breakdown.catchBonus +
          r.breakdown.timeBonus +
          r.breakdown.heartsBonus) *
          DIFFICULTIES.medium.scoreMultiplier,
      ),
    );
  });

  it('is defeated after losing every heart', () => {
    const rocks = Array.from({ length: 8 }, (_, i) => obstacle('trunk', 30 + i * 40, 1.2, 0, 1.3));
    const sim = makeSim(flatCourse(rocks));
    stepUntil(sim, (s) => s.over, 60 * 120);
    expect(sim.outcome).toBe('defeated');
    expect(sim.hearts).toBe(0);
    expect(sim.result().breakdown.catchBonus).toBe(0);
  });

  it('lets the fireball escape when it reaches the shrine', () => {
    const sim = makeSim(flatCourse([], { startGap: 200, length: 400 }));
    stepUntil(sim, (s) => s.over, 60 * 120);
    expect(sim.outcome).toBe('escaped');
  });

  it('two identical simulations stay bit-identical', () => {
    const config = {
      seed: 77,
      difficulty: 'hard' as const,
      stage: 'moonlit' as const,
      abilities: { dash: true, leap: true, shield: true },
    };
    const a = new ChaseSimulation(config);
    const b = new ChaseSimulation(config);
    for (let i = 0; i < 3000; i++) {
      if (i % 97 === 0) {
        a.input(INPUT.JumpDown);
        b.input(INPUT.JumpDown);
      }
      if (i % 97 === 12) {
        a.input(INPUT.JumpUp);
        b.input(INPUT.JumpUp);
      }
      a.step();
      b.step();
    }
    expect(a.digest()).toBe(b.digest());
  });
});
