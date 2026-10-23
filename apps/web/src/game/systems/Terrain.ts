import type * as Phaser from 'phaser';
import { groundAt, type Course } from '@dbfc/shared';
import { BIOMES, type BiomePalette } from '../art/biomes';
import { artRandom, ellipse, ensureTexture, getRenderScale, releaseTexture } from '../art/canvas';
import { rgba, shade } from '../art/color';
import { DEPTH, PPM } from '../constants';

const CHUNK_M = 16;
const ABOVE_M = 0.8;
const BELOW_M = 6.5;

let runCounter = 0;

/** Draws the ground in cached 16 m chunks (grass edge, soil, stones, ravines). */
export class TerrainRenderer {
  private chunks = new Map<number, { img: Phaser.GameObjects.Image; key: string }>();
  private readonly runId = ++runCounter;
  private readonly palette: BiomePalette;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly course: Course,
  ) {
    this.palette = BIOMES[course.stage];
  }

  /** Make sure chunks covering [left, right] (metres) exist; drop old ones. */
  update(leftM: number, rightM: number): void {
    const first = Math.floor((leftM - 2) / CHUNK_M);
    const last = Math.floor((rightM + 6) / CHUNK_M);
    let built = 0;
    for (let i = first; i <= last; i++) {
      if (!this.chunks.has(i) && (built === 0 || i <= Math.floor(rightM / CHUNK_M))) {
        this.build(i);
        built++;
      }
    }
    for (const [i, c] of this.chunks) {
      if (i < first - 1) {
        c.img.destroy();
        releaseTexture(this.scene, c.key);
        this.chunks.delete(i);
      }
    }
  }

  private build(index: number): void {
    const x0 = index * CHUNK_M;
    const x1 = x0 + CHUNK_M;
    let hMax = -Infinity;
    let hMin = Infinity;
    for (let x = x0; x <= x1; x += 0.5) {
      const h = groundAt(this.course, x);
      hMax = Math.max(hMax, h);
      hMin = Math.min(hMin, h);
    }
    const top = hMax + ABOVE_M;
    const bottom = hMin - BELOW_M;
    // Chunks overlap by a few pixels so filtered (semi-transparent) edge columns never line up.
    const w = CHUNK_M * PPM + 8;
    const h = (top - bottom) * PPM;
    const key = `terrain-${this.runId}-${index}`;
    ensureTexture(this.scene, key, w, h, (ctx) => this.draw(ctx, x0, top, w, h, index));
    const img = this.scene.add.image(x0 * PPM - 4, -top * PPM, key);
    img.setOrigin(0, 0);
    img.setScale(1 / getRenderScale());
    img.setDepth(DEPTH.terrain);
    this.chunks.set(index, { img, key });
  }

  private draw(
    ctx: CanvasRenderingContext2D,
    x0: number,
    top: number,
    w: number,
    h: number,
    index: number,
  ): void {
    const p = this.palette;
    const course = this.course;
    const rnd = artRandom(course.decorSeed + index * 7919);
    const toX = (m: number) => (m - x0) * PPM + 4;
    const toY = (m: number) => (top - m) * PPM;
    const pits: [number, number][] = [];
    for (let i = 0; i < course.pits.length; i += 2) {
      const a = course.pits[i]!;
      const b = course.pits[i + 1]!;
      if (b >= x0 - 1 && a <= x0 + CHUNK_M + 1) pits.push([a, b]);
    }
    const inPit = (m: number) => pits.some(([a, b]) => m > a && m < b);

    // Surface segments split by pits.
    const segments: [number, number][] = [];
    let segStart = x0 - 0.12;
    for (const [a, b] of pits) {
      if (a > segStart) segments.push([segStart, Math.min(a, x0 + CHUNK_M + 0.12)]);
      segStart = Math.max(segStart, b);
    }
    if (segStart < x0 + CHUNK_M + 0.12) segments.push([segStart, x0 + CHUNK_M + 0.12]);

    // Ravines (behind the soil): dark depth gradient and cliff walls.
    for (const [a, b] of pits) {
      const g = ctx.createLinearGradient(0, toY(groundAt(course, a)), 0, h);
      g.addColorStop(0, shade(p.dirtDark, -0.35));
      g.addColorStop(1, '#050605');
      ctx.fillStyle = g;
      ctx.fillRect(toX(a), toY(groundAt(course, a)) + 4, toX(b) - toX(a), h);
      ctx.fillStyle = rgba(p.fog, 0.12);
      ctx.fillRect(toX(a), toY(groundAt(course, a)) + 40, toX(b) - toX(a), 30);
    }

    for (const [sa, sb] of segments) {
      const pts: [number, number][] = [];
      for (let m = sa; m < sb; m += 0.25) pts.push([toX(m), toY(groundAt(course, m))]);
      pts.push([toX(sb), toY(groundAt(course, sb))]);
      // Extend to the canvas edges where the segment touches the chunk boundary.
      if (sa <= x0) pts.unshift([0, toY(groundAt(course, x0 - 4 / PPM))]);
      if (sb >= x0 + CHUNK_M) pts.push([w, toY(groundAt(course, x0 + CHUNK_M + 4 / PPM))]);
      if (pts.length < 2) continue;
      // Soil body
      ctx.beginPath();
      ctx.moveTo(pts[0]![0], h);
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.lineTo(pts[pts.length - 1]![0], h);
      ctx.closePath();
      const soil = ctx.createLinearGradient(0, 0, 0, h);
      soil.addColorStop(0, p.dirtLight);
      soil.addColorStop(0.25, p.dirt);
      soil.addColorStop(1, p.dirtDark);
      ctx.fillStyle = soil;
      ctx.fill();

      // Cliff faces at pit edges.
      for (const [a, b] of pits) {
        for (const edge of [a, b]) {
          if (Math.abs(edge - sa) < 0.01 || Math.abs(edge - sb) < 0.01) {
            const ex = toX(edge);
            const ey = toY(groundAt(course, edge));
            const dir = Math.abs(edge - sb) < 0.01 ? -1 : 1;
            ctx.fillStyle = shade(p.stone, -0.35);
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex + dir * 10, ey + 30);
            ctx.lineTo(ex + dir * 4, h);
            ctx.lineTo(ex + dir * 22, h);
            ctx.lineTo(ex + dir * 22, ey);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // Strata, stones and roots inside the soil.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0]![0], h);
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.lineTo(pts[pts.length - 1]![0], h);
      ctx.closePath();
      ctx.clip();
      const span = pts[pts.length - 1]![0] - pts[0]![0];
      ctx.strokeStyle = rgba(p.dirtDark, 0.5);
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const yOff = 40 + i * 45 + rnd() * 10;
        ctx.beginPath();
        for (let k = 0; k < pts.length; k += 2) {
          const [x, y] = pts[k]!;
          const yy = y + yOff + Math.sin(x * 0.02 + i) * 4;
          if (k === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      const stones = Math.floor(span / 26);
      for (let i = 0; i < stones; i++) {
        const sx = pts[0]![0] + rnd() * span;
        const sy = toY(groundAt(course, x0 + (sx - 4) / PPM)) + 18 + rnd() * (h * 0.6);
        const r = 2 + rnd() * 6;
        ctx.fillStyle = shade(p.stone, -0.2 + rnd() * 0.25);
        ellipse(ctx, sx, sy, r * 1.3, r);
        ctx.fill();
        ctx.fillStyle = rgba('#ffffff', 0.12);
        ellipse(ctx, sx - r * 0.3, sy - r * 0.35, r * 0.5, r * 0.3);
        ctx.fill();
      }
      ctx.strokeStyle = rgba(shade(p.trunk, -0.1), 0.75);
      ctx.lineCap = 'round';
      for (let i = 0; i < Math.floor(span / 120) + 1; i++) {
        const rx = pts[0]![0] + rnd() * span;
        const ry = toY(groundAt(course, x0 + (rx - 4) / PPM)) + 8;
        ctx.lineWidth = 2 + rnd() * 2;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.bezierCurveTo(
          rx + 10,
          ry + 20,
          rx - 14,
          ry + 34,
          rx + 6 + rnd() * 20,
          ry + 50 + rnd() * 30,
        );
        ctx.stroke();
      }
      ctx.restore();

      // Grass band and blades along the surface.
      ctx.lineJoin = 'round';
      ctx.strokeStyle = p.grassDark;
      ctx.lineWidth = 12;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y + 5) : ctx.lineTo(x, y + 5)));
      ctx.stroke();
      ctx.strokeStyle = p.grass;
      ctx.lineWidth = 7;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y + 2) : ctx.lineTo(x, y + 2)));
      ctx.stroke();
      ctx.strokeStyle = p.grassLight;
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y - 0.5) : ctx.lineTo(x, y - 0.5)));
      ctx.stroke();
      const blades = Math.floor(span / 3.2);
      for (let i = 0; i < blades; i++) {
        const bx = pts[0]![0] + rnd() * span;
        const m = x0 + (bx - 4) / PPM;
        if (inPit(m)) continue;
        const by = toY(groundAt(course, m)) + 1;
        const len = 4 + rnd() * 9;
        ctx.strokeStyle = rnd() < 0.5 ? p.grassLight : p.grass;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + 1, by - len * 0.6, bx + (rnd() - 0.4) * 5, by - len);
        ctx.stroke();
      }
      // Flowers / glowing caps.
      const flowers = Math.floor(span / 70);
      for (let i = 0; i < flowers; i++) {
        const fx = pts[0]![0] + rnd() * span;
        const m = x0 + (fx - 4) / PPM;
        if (inPit(m)) continue;
        const fy = toY(groundAt(course, m)) - 3 - rnd() * 4;
        ctx.strokeStyle = p.grassDark;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(fx, fy + 6);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        ctx.fillStyle = rnd() < 0.6 ? p.accent : p.accent2;
        ellipse(ctx, fx, fy, 2.4, 2.4);
        ctx.fill();
      }
    }
  }

  destroy(): void {
    for (const c of this.chunks.values()) {
      c.img.destroy();
      releaseTexture(this.scene, c.key);
    }
    this.chunks.clear();
  }
}
