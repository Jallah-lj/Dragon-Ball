import { describe, expect, it } from 'vitest';
import { hashString, Rng, smoothWave } from '../src/index';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('produces a stable, engine-independent sequence (snapshot)', () => {
    const r = new Rng(42);
    const values = Array.from({ length: 5 }, () => r.nextU32());
    expect(values).toMatchInlineSnapshot(`
      [
        1028872839,
        2516511472,
        400437680,
        853279530,
        1920286840,
      ]
    `);
  });

  it('keeps floats within [0, 1) and ints within bounds', () => {
    const r = new Rng(7);
    for (let i = 0; i < 5000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(-3, 3);
      expect(n).toBeGreaterThanOrEqual(-3);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('forks independent streams without disturbing determinism', () => {
    const a = new Rng(99);
    const b = new Rng(99);
    const fa = a.fork(1);
    const fb = b.fork(1);
    expect(fa.nextU32()).toBe(fb.nextU32());
    expect(a.nextU32()).toBe(b.nextU32());
  });

  it('hashes strings stably', () => {
    expect(hashString('dragon')).toBe(hashString('dragon'));
    expect(hashString('dragon')).not.toBe(hashString('Dragon'));
  });
});

describe('smoothWave', () => {
  it('behaves like a sine wave at key phases', () => {
    expect(smoothWave(0)).toBeCloseTo(0);
    expect(smoothWave(0.25)).toBeCloseTo(1);
    expect(smoothWave(0.5)).toBeCloseTo(0);
    expect(smoothWave(0.75)).toBeCloseTo(-1);
    expect(smoothWave(1.25)).toBeCloseTo(1);
    expect(smoothWave(-0.25)).toBeCloseTo(-1);
  });
});
