import { describe, expect, it } from 'vitest';
import {
  Autopilot,
  ChaseSimulation,
  DIFFICULTY_IDS,
  playWithAutopilot,
  STAGE_IDS,
} from '../src/index';

const SEEDS = Number(process.env.FAIRNESS_SEEDS ?? 4);

/**
 * The look-ahead autopilot (no timing mistakes) must clear every generated
 * course without taking damage and catch the fireball. This proves that the
 * generator never produces impossible obstacle combinations.
 */
describe('course fairness (autopilot)', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    for (const stage of STAGE_IDS) {
      it(`${difficulty}/${stage}: clean catch on ${SEEDS} seeds`, { timeout: 120_000 }, () => {
        for (let i = 1; i <= SEEDS; i++) {
          const seed = (i * 2654435761 + stage.length * 97) >>> 0;
          const sim = new ChaseSimulation({
            seed,
            difficulty,
            stage,
            abilities: { dash: true, leap: true, shield: true },
          });
          playWithAutopilot(sim, new Autopilot({ seed: i, useShield: false }));
          const r = sim.result();
          expect({
            seed,
            outcome: r.outcome,
            harms: r.hits + r.pitFalls + r.stumbles + r.mudHits,
          }).toEqual({
            seed,
            outcome: 'caught',
            harms: 0,
          });
        }
      });
    }
  }
});
