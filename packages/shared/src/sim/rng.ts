/**
 * Deterministic pseudo-random number generator (sfc32 seeded with splitmix32).
 *
 * Uses only 32-bit integer operations, so the same seed produces the exact same
 * sequence in every JavaScript engine (V8, SpiderMonkey, JavaScriptCore). The
 * course generator, the client and the server verifier all depend on this.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    let s = seed >>> 0;
    const splitmix = (): number => {
      s = (s + 0x9e3779b9) | 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = splitmix();
    this.b = splitmix();
    this.c = splitmix();
    this.d = splitmix();
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). Division by 2^32 is exact in IEEE-754. */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty list');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w > 0 ? w : 0;
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      const w = weights[i] ?? 0;
      if (w <= 0) continue;
      r -= w;
      if (r < 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  }

  /** Derive an independent generator (e.g. for decoration) without disturbing this stream. */
  fork(salt: number): Rng {
    return new Rng((this.nextU32() ^ Math.imul(salt | 0, 0x27d4eb2d)) >>> 0);
  }
}

/** Stable 32-bit FNV-1a hash of a string (for daily seeds, room codes, etc.). */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
