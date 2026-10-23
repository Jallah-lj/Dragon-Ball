import { describe, expect, it } from 'vitest';
import {
  Autopilot,
  ChaseSimulation,
  INPUT,
  MAX_INPUT_EVENTS,
  playWithAutopilot,
  replayRun,
  validateInputs,
  type RunConfig,
} from '../src/index';

const config = (seed: number, difficulty: RunConfig['difficulty'] = 'medium'): RunConfig => ({
  seed,
  difficulty,
  stage: 'emerald',
  abilities: { dash: true, leap: true, shield: true },
});

describe('replay verification', () => {
  it('replaying a recorded input log reproduces the live result exactly', () => {
    for (const [seed, difficulty] of [
      [11, 'easy'],
      [22, 'medium'],
      [33, 'hard'],
    ] as const) {
      const live = new ChaseSimulation(config(seed, difficulty));
      const { inputs } = playWithAutopilot(live, new Autopilot({ seed, mistakeChance: 0.2 }));
      const replayed = replayRun(config(seed, difficulty), inputs);
      expect(replayed).toEqual(live.result());
    }
  });

  it('a tampered input log produces a different (honest) result', () => {
    const live = new ChaseSimulation(config(5));
    const { inputs } = playWithAutopilot(live, new Autopilot({ seed: 5 }));
    const tampered = inputs.slice(0, Math.floor(inputs.length / 4) * 2); // drop most inputs
    const replayed = replayRun(config(5), tampered);
    expect(replayed.score).toBeLessThan(live.result().score);
  });

  it('the same inputs on a different seed give a different result', () => {
    const live = new ChaseSimulation(config(5));
    const { inputs } = playWithAutopilot(live, new Autopilot({ seed: 5 }));
    expect(replayRun(config(6), inputs).score).not.toBe(live.result().score);
  });
});

describe('validateInputs', () => {
  it('accepts well-formed logs', () => {
    const r = validateInputs([0, INPUT.JumpDown, 10, INPUT.JumpUp, 10, INPUT.Dash]);
    expect(r.ok).toBe(true);
  });

  it.each([
    ['not an array', { a: 1 }],
    ['odd length', [1, 1, 2]],
    ['negative tick', [-1, 1]],
    ['fractional tick', [1.5, 1]],
    ['unknown code', [1, 99]],
    ['decreasing ticks', [10, 1, 5, 2]],
    ['string values', ['1', 1]],
    ['too many per tick', [3, 1, 3, 2, 3, 1, 3, 2, 3, 1, 3, 2, 3, 1]],
  ])('rejects %s', (_label, raw) => {
    expect(validateInputs(raw).ok).toBe(false);
  });

  it('rejects logs that are too long', () => {
    const big: number[] = [];
    for (let i = 0; i <= MAX_INPUT_EVENTS; i++) big.push(i, INPUT.JumpDown);
    expect(validateInputs(big).ok).toBe(false);
  });
});
