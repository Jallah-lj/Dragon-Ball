/**
 * Deterministic math helpers.
 *
 * The simulation deliberately avoids Math.sin/cos/exp/pow: the ECMAScript spec
 * allows those to differ slightly between engines, which would break replay
 * verification. Only +, -, *, /, comparisons, floor and sqrt are used.
 */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

/**
 * Sine-like periodic wave built from a cubic-smoothed triangle wave.
 * `phase` is in cycles (any real number); output is in [-1, 1] with
 * zero slope at the peaks, peaking at phase 0.25 like sin(2πx).
 */
export function smoothWave(phase: number): number {
  const p = phase - Math.floor(phase);
  let tri: number;
  if (p < 0.25) tri = p * 4;
  else if (p < 0.75) tri = 2 - p * 4;
  else tri = p * 4 - 4;
  return tri * (1.5 - 0.5 * tri * tri);
}

/** Positive modulo for integers/floats. */
export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
