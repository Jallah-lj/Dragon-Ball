import { describe, expect, it } from 'vitest';
import {
  DIFFICULTIES,
  DIFFICULTY_IDS,
  generateCourse,
  groundAt,
  isOverPit,
  STAGE_IDS,
} from '../src/index';

describe('generateCourse', () => {
  it('is fully deterministic', () => {
    const a = generateCourse({ seed: 2024, difficulty: 'medium', stage: 'mistpine' });
    const b = generateCourse({ seed: 2024, difficulty: 'medium', stage: 'mistpine' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('differs between seeds', () => {
    const a = generateCourse({ seed: 1, difficulty: 'medium', stage: 'emerald' });
    const b = generateCourse({ seed: 2, difficulty: 'medium', stage: 'emerald' });
    expect(JSON.stringify(a.obstacles)).not.toBe(JSON.stringify(b.obstacles));
  });

  for (const difficulty of DIFFICULTY_IDS) {
    for (const stage of STAGE_IDS) {
      it(`satisfies structural fairness invariants (${difficulty}/${stage})`, () => {
        for (let seed = 1; seed <= 25; seed++) {
          const c = generateCourse({ seed: seed * 104729, difficulty, stage });
          const d = DIFFICULTIES[difficulty];
          expect(c.length).toBe(d.courseLength);
          expect(c.obstacles.length).toBeGreaterThan(20);
          // Obstacles cover the whole course and the first one leaves a safe run-up.
          expect(c.obstacles[0]!.x).toBeGreaterThanOrEqual(25);
          expect(c.obstacles[c.obstacles.length - 1]!.x).toBeGreaterThan(c.length);

          let prevEnd = -Infinity;
          for (const o of c.obstacles) {
            const left = o.kind === 'boulder' ? o.stopX : o.x;
            // Regions never overlap (boulders include their roll lane).
            expect(left).toBeGreaterThanOrEqual(prevEnd);
            prevEnd = o.x + o.w;
            // Obstacles sit on flat ground.
            expect(groundAt(c, left)).toBeCloseTo(o.ground, 6);
            expect(groundAt(c, o.x + o.w)).toBeCloseTo(o.ground, 6);
            if (o.kind === 'gap') expect(o.w).toBeLessThanOrEqual(4.2);
            if (o.kind === 'swing' || o.kind === 'snare') expect(d.tier).toBeGreaterThan(0);
          }
          // Collectibles are never buried in solid obstacles.
          for (const col of c.collectibles) {
            for (const o of c.obstacles) {
              if (
                o.kind === 'gap' ||
                o.kind === 'mud' ||
                o.kind === 'boulder' ||
                o.kind === 'swing' ||
                o.kind === 'snare'
              )
                continue;
              const inside =
                col.x > o.x &&
                col.x < o.x + o.w &&
                col.y > o.ground + o.y0 &&
                col.y < o.ground + o.y1;
              expect(inside).toBe(false);
            }
          }
          // Every pit corresponds to a gap obstacle.
          expect(c.pits.length / 2).toBe(c.obstacles.filter((o) => o.kind === 'gap').length);
          expect(c.collectibles.filter((x) => x.kind === 'scale').length).toBeLessThanOrEqual(1);
        }
      });
    }
  }

  it('reports pits only when the support span is fully over the gap', () => {
    const c = generateCourse({ seed: 5, difficulty: 'hard', stage: 'mistpine' });
    const gap = c.obstacles.find((o) => o.kind === 'gap');
    expect(gap).toBeDefined();
    if (!gap) return;
    expect(isOverPit(c, gap.x + gap.w / 2)).toBe(true);
    expect(isOverPit(c, gap.x + 0.1)).toBe(false);
    expect(isOverPit(c, gap.x - 2)).toBe(false);
  });
});
