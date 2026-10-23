import type * as Phaser from 'phaser';

/**
 * Procedural texture factory. Textures are drawn once at `scale` × logical size
 * into canvases that are cached for the lifetime of the page, so recreating the
 * Phaser game (navigating between pages) is instant.
 */
const cache = new Map<string, HTMLCanvasElement>();

export type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

let renderScale = 1;

export function setRenderScale(scale: number): void {
  if (scale !== renderScale) {
    renderScale = scale;
    cache.clear();
  }
}

export function getRenderScale(): number {
  return renderScale;
}

export function drawCanvas(
  key: string,
  w: number,
  h: number,
  draw: DrawFn,
  scale = renderScale,
): HTMLCanvasElement {
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * scale));
  canvas.height = Math.max(1, Math.ceil(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.scale(scale, scale);
  draw(ctx, w, h);
  cache.set(key, canvas);
  return canvas;
}

/**
 * Ensure a texture exists in this game's texture manager. `scale` overrides the
 * render scale (soft background layers are drawn at 1× to save memory).
 */
export function ensureTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: DrawFn,
  scale?: number,
): string {
  if (!scene.textures.exists(key)) {
    scene.textures.addCanvas(key, drawCanvas(key, w, h, draw, scale));
  }
  return key;
}

/** Drop a cached canvas (e.g. per-run terrain chunks) and its texture. */
export function releaseTexture(scene: Phaser.Scene, key: string): void {
  cache.delete(key);
  if (scene.textures.exists(key)) scene.textures.remove(key);
}

/** Deterministic tiny PRNG for art (independent of gameplay RNG). */
export function artRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** Draw `fn` at x, and again shifted by ±period when it crosses an edge (for tileable textures). */
export function wrapDraw(x: number, radius: number, period: number, fn: (x: number) => void): void {
  fn(x);
  if (x - radius < 0) fn(x + period);
  if (x + radius > period) fn(x - period);
}

export function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot = 0,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

/** Smooth closed/open path through points using quadratic midpoints. */
export function smoothPath(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  close = false,
): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  const first = pts[0]!;
  if (close) {
    const last = pts[pts.length - 1]!;
    ctx.moveTo((first[0] + last[0]) / 2, (first[1] + last[1]) / 2);
  } else {
    ctx.moveTo(first[0], first[1]);
  }
  for (let i = 0; i < pts.length - (close ? 0 : 1); i++) {
    const p = pts[i]!;
    const n = pts[(i + 1) % pts.length]!;
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2);
  }
  if (!close) {
    const last = pts[pts.length - 1]!;
    ctx.lineTo(last[0], last[1]);
  } else {
    ctx.closePath();
  }
}
