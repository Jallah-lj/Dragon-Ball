/**
 * Procedural forest backdrop layers. Every layer texture is horizontally
 * tileable so it can scroll forever as a parallax TileSprite.
 */
import type * as Phaser from 'phaser';
import type { StageId } from '@dbfc/shared';
import { BIOMES, type BiomePalette } from './biomes';
import { artRandom, ellipse, ensureTexture, wrapDraw } from './canvas';
import { mix, rgba, shade } from './color';

export const LAYER_W = 1024;

/** Periodic ridge: sum of sines with whole cycles across the texture width. */
function ridge(x: number, seed: number, amps: number[]): number {
  let y = 0;
  amps.forEach((a, i) => {
    const k = [1, 2, 3, 5, 8, 13][i] ?? i + 1;
    const phase = ((seed * (i + 3) * 97) % 628) / 100;
    y += a * Math.sin((2 * Math.PI * k * x) / LAYER_W + phase);
  });
  return y;
}

// ---------------------------------------------------------------- Trees

function canopy(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  light: string,
  rnd: () => number,
  lightAlpha = 0.85,
): void {
  const blobs: [number, number, number][] = [];
  const n = 6 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = r * 0.5 * Math.sqrt(rnd());
    blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.75, r * (0.42 + rnd() * 0.32)]);
  }
  // Lit rim toward the sun (upper right), then body, then soft shadow dabs.
  ctx.globalAlpha = lightAlpha;
  ctx.fillStyle = light;
  for (const [x, y, br] of blobs) {
    ellipse(ctx, x + br * 0.16, y - br * 0.18, br, br * 0.92);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  for (const [x, y, br] of blobs) {
    ellipse(ctx, x - br * 0.06, y + br * 0.08, br * 0.96, br * 0.9);
    ctx.fill();
  }
  ctx.fillStyle = shade(color, -0.18);
  for (const [x, y, br] of blobs.slice(0, 3)) {
    ellipse(ctx, x - br * 0.25, y + br * 0.35, br * 0.6, br * 0.42);
    ctx.fill();
  }
}

function oak(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  h: number,
  p: TreeColors,
  rnd: () => number,
) {
  const trunkW = h * 0.07;
  ctx.fillStyle = p.trunk;
  ctx.beginPath();
  ctx.moveTo(x - trunkW * 1.4, base);
  ctx.quadraticCurveTo(x - trunkW * 0.6, base - h * 0.25, x - trunkW * 0.5, base - h * 0.55);
  ctx.lineTo(x + trunkW * 0.5, base - h * 0.55);
  ctx.quadraticCurveTo(x + trunkW * 0.6, base - h * 0.25, x + trunkW * 1.4, base);
  ctx.closePath();
  ctx.fill();
  // Branch hints
  ctx.strokeStyle = p.trunk;
  ctx.lineWidth = trunkW * 0.45;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, base - h * 0.45);
  ctx.quadraticCurveTo(x - h * 0.12, base - h * 0.55, x - h * 0.2, base - h * 0.62);
  ctx.moveTo(x, base - h * 0.5);
  ctx.quadraticCurveTo(x + h * 0.1, base - h * 0.6, x + h * 0.18, base - h * 0.66);
  ctx.stroke();
  const r = h * 0.26;
  canopy(ctx, x - r * 0.55, base - h * 0.66, r * 0.8, p.leaf, p.leafLight, rnd);
  canopy(ctx, x + r * 0.6, base - h * 0.68, r * 0.78, p.leaf, p.leafLight, rnd);
  canopy(ctx, x, base - h * 0.8, r, p.leaf, p.leafLight, rnd);
}

function pine(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  h: number,
  p: TreeColors,
  rnd: () => number,
) {
  const w = h * (0.34 + rnd() * 0.06);
  ctx.fillStyle = p.trunk;
  ctx.fillRect(x - h * 0.02, base - h * 0.2, h * 0.04, h * 0.2);
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const top = base - h + t * h * 0.6;
    const bottom = top + h * 0.3;
    const half = w * 0.5 * (0.32 + t * 0.68);
    const droop = (bottom - top) * 0.16;
    // Subtle rim light on the sun side (right), body offset to the left.
    for (const [color, off] of [
      [mix(p.leaf, p.leafLight, 0.55), half * 0.05],
      [p.leaf, -half * 0.03],
    ] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x + off, top);
      ctx.quadraticCurveTo(
        x + off + half * 0.45,
        top + (bottom - top) * 0.55,
        x + off + half,
        bottom,
      );
      ctx.quadraticCurveTo(x + off + half * 0.5, bottom - droop, x + off, bottom - droop * 0.4);
      ctx.quadraticCurveTo(x + off - half * 0.5, bottom - droop, x + off - half, bottom);
      ctx.quadraticCurveTo(x + off - half * 0.45, top + (bottom - top) * 0.55, x + off, top);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function ancient(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  h: number,
  p: TreeColors,
  rnd: () => number,
) {
  const w = h * 0.1;
  ctx.fillStyle = p.trunk;
  ctx.beginPath();
  ctx.moveTo(x - w * 1.8, base);
  ctx.bezierCurveTo(
    x - w * 0.6,
    base - h * 0.2,
    x - w * 1.2,
    base - h * 0.45,
    x - w * 0.4,
    base - h * 0.62,
  );
  ctx.lineTo(x + w * 0.5, base - h * 0.62);
  ctx.bezierCurveTo(x + w * 1.1, base - h * 0.4, x + w * 0.4, base - h * 0.2, x + w * 1.9, base);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = p.trunk;
  ctx.lineCap = 'round';
  for (const dir of [-1, 1]) {
    ctx.lineWidth = w * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, base - h * 0.55);
    ctx.bezierCurveTo(
      x + dir * h * 0.1,
      base - h * 0.62,
      x + dir * h * 0.16,
      base - h * 0.58,
      x + dir * h * 0.26,
      base - h * 0.7,
    );
    ctx.stroke();
  }
  const r = h * 0.2;
  canopy(ctx, x - h * 0.24, base - h * 0.74, r * 0.85, p.leaf, p.leafLight, rnd, 0.6);
  canopy(ctx, x + h * 0.25, base - h * 0.76, r * 0.8, p.leaf, p.leafLight, rnd, 0.6);
  canopy(ctx, x, base - h * 0.86, r, p.leaf, p.leafLight, rnd, 0.6);
}

interface TreeColors {
  trunk: string;
  leaf: string;
  leafLight: string;
}

type TreeFn = typeof oak;

function treeFor(stage: StageId, rnd: () => number): TreeFn {
  if (stage === 'mistpine') return rnd() < 0.85 ? pine : oak;
  if (stage === 'moonlit') return rnd() < 0.6 ? ancient : oak;
  return oak;
}

// ---------------------------------------------------------------- Layers

export interface LayerSpec {
  key: string;
  width: number;
  height: number;
}

function key(stage: StageId, name: string): string {
  return `bg-${stage}-${name}`;
}

export function skyTexture(scene: Phaser.Scene, stage: StageId, late: boolean): LayerSpec {
  const b = BIOMES[stage];
  const k = key(stage, late ? 'sky-late' : 'sky');
  const [top, mid, bottom] = late ? b.skyLate : b.sky;
  ensureTexture(
    scene,
    k,
    16,
    720,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, top);
      g.addColorStop(0.55, mid);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    1,
  );
  return { key: k, width: 16, height: 720 };
}

export function sunTexture(scene: Phaser.Scene, stage: StageId): LayerSpec {
  const b = BIOMES[stage];
  const k = key(stage, 'sun');
  const size = 420;
  ensureTexture(
    scene,
    k,
    size,
    size,
    (ctx) => {
      const c = size / 2;
      const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
      glow.addColorStop(0, rgba(b.sunGlow, b.night ? 0.55 : 0.8));
      glow.addColorStop(0.25, rgba(b.sunGlow, b.night ? 0.18 : 0.35));
      glow.addColorStop(1, rgba(b.sunGlow, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = b.sun;
      ellipse(ctx, c, c, b.night ? 34 : 40, b.night ? 34 : 40);
      ctx.fill();
      if (b.night) {
        // Moon craters, softly.
        ctx.fillStyle = rgba('#c9c3a8', 0.35);
        for (const [dx, dy, r] of [
          [-10, -8, 8],
          [12, 6, 6],
          [-4, 14, 5],
        ] as const) {
          ellipse(ctx, c + dx, c + dy, r, r);
          ctx.fill();
        }
      }
    },
    1,
  );
  return { key: k, width: size, height: size };
}

export function hillsTexture(scene: Phaser.Scene, stage: StageId): LayerSpec {
  const b = BIOMES[stage];
  const k = key(stage, 'hills');
  const H = 300;
  ensureTexture(
    scene,
    k,
    LAYER_W,
    H,
    (ctx) => {
      const seed = stage.length * 31;
      const top = (x: number) =>
        120 + ridge(x, seed, stage === 'mistpine' ? [38, 22, 14, 8, 4] : [26, 18, 10, 6, 3]);
      ctx.fillStyle = b.hillsLight;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= LAYER_W; x += 4) ctx.lineTo(x, top(x) - 3);
      ctx.lineTo(LAYER_W, H);
      ctx.closePath();
      ctx.fill();
      const g = ctx.createLinearGradient(0, 80, 0, H);
      g.addColorStop(0, b.hills);
      g.addColorStop(1, mix(b.hills, b.fog, 0.55));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= LAYER_W; x += 4) ctx.lineTo(x, top(x) + 2);
      ctx.lineTo(LAYER_W, H);
      ctx.closePath();
      ctx.fill();
    },
    1,
  );
  return { key: k, width: LAYER_W, height: H };
}

function treeLayer(
  scene: Phaser.Scene,
  stage: StageId,
  name: string,
  H: number,
  count: number,
  minH: number,
  maxH: number,
  colors: TreeColors,
  fogTint: number,
  seed: number,
  base: number,
): LayerSpec {
  const b = BIOMES[stage];
  const k = key(stage, name);
  ensureTexture(
    scene,
    k,
    LAYER_W,
    H,
    (ctx) => {
      const rnd = artRandom(seed + stage.length * 101);
      // Continuous canopy mass so the layer never shows holes.
      ctx.fillStyle = colors.leaf;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= LAYER_W; x += 6)
        ctx.lineTo(x, base - minH * 0.55 + ridge(x, seed, [10, 8, 6, 4, 3]));
      ctx.lineTo(LAYER_W, H);
      ctx.closePath();
      ctx.fill();
      const trees: [number, number, TreeFn][] = [];
      for (let i = 0; i < count; i++) {
        const x = (i + rnd() * 0.8) * (LAYER_W / count);
        trees.push([x, minH + rnd() * (maxH - minH), treeFor(stage, rnd)]);
      }
      trees.sort((a, c) => a[1] - c[1]);
      for (const [x, h, fn] of trees) {
        wrapDraw(x, h * 0.45, LAYER_W, (xx) =>
          fn(ctx, xx, base + rnd() * 6, h, colors, artRandom(Math.floor(x * 13 + h))),
        );
      }
      // Atmospheric fade toward the bottom.
      const g = ctx.createLinearGradient(0, base - minH * 0.4, 0, H);
      g.addColorStop(0, rgba(b.fog, 0));
      g.addColorStop(1, rgba(b.fog, fogTint));
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, LAYER_W, H);
      ctx.globalCompositeOperation = 'source-over';
      if (b.night && name !== 'far') {
        // Fireflies and glowing fungi caught in the canopy.
        for (let i = 0; i < 26; i++) {
          const x = rnd() * LAYER_W;
          const y = base - rnd() * maxH * 0.8;
          ctx.fillStyle = rgba(i % 3 === 0 ? b.accent2 : b.accent, 0.5 + rnd() * 0.4);
          ellipse(ctx, x, y, 1.2, 1.2);
          ctx.fill();
        }
      }
    },
    1,
  );
  return { key: k, width: LAYER_W, height: H };
}

export function farTreesTexture(scene: Phaser.Scene, stage: StageId): LayerSpec {
  const b = BIOMES[stage];
  return treeLayer(
    scene,
    stage,
    'far',
    340,
    16,
    120,
    190,
    { trunk: shade(b.far, -0.1), leaf: b.far, leafLight: b.farLight },
    0.5,
    11,
    330,
  );
}

export function midTreesTexture(scene: Phaser.Scene, stage: StageId): LayerSpec {
  const b = BIOMES[stage];
  return treeLayer(
    scene,
    stage,
    'mid',
    470,
    9,
    230,
    360,
    { trunk: shade(b.trunk, 0.05), leaf: b.mid, leafLight: b.midLight },
    0.32,
    23,
    462,
  );
}

export function nearTreesTexture(scene: Phaser.Scene, stage: StageId): LayerSpec {
  const b = BIOMES[stage];
  const k = key(stage, 'near');
  const W = 1536;
  const H = 640;
  ensureTexture(
    scene,
    k,
    W,
    H,
    (ctx) => {
      const rnd = artRandom(77 + stage.length);
      const trunkColor = mix(b.trunk, b.fog, b.night ? 0.05 : 0.12);
      const darkColor = mix(b.trunkDark, b.fog, b.night ? 0.03 : 0.08);
      const slots = [0.08, 0.36, 0.62, 0.86];
      slots.forEach((slot, i) => {
        const x = (slot + (rnd() - 0.5) * 0.08) * W;
        const w = [34, 62, 44, 72][i]! * (0.85 + rnd() * 0.3);
        const lean = (rnd() - 0.5) * 50;
        const draw = (xx: number) => {
          // Root flare
          ctx.fillStyle = darkColor;
          ctx.beginPath();
          ctx.moveTo(xx - w * 1.7, H);
          ctx.quadraticCurveTo(xx - w * 0.75, H - 34, xx - w * 0.56, H - 120);
          ctx.lineTo(xx + w * 0.56, H - 120);
          ctx.quadraticCurveTo(xx + w * 0.75, H - 34, xx + w * 1.8, H);
          ctx.closePath();
          ctx.fill();
          // Trunk with a sun-side rim (light comes from the upper right).
          const g = ctx.createLinearGradient(xx - w / 2, 0, xx + w / 2, 0);
          g.addColorStop(0, darkColor);
          g.addColorStop(0.55, trunkColor);
          g.addColorStop(0.9, shade(trunkColor, 0.18));
          g.addColorStop(1, shade(trunkColor, 0.05));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(xx - w / 2 + lean, -10);
          ctx.lineTo(xx + w / 2 + lean, -10);
          ctx.quadraticCurveTo(xx + w * 0.5 + lean * 0.4, H * 0.5, xx + w * 0.62, H - 110);
          ctx.lineTo(xx - w * 0.62, H - 110);
          ctx.quadraticCurveTo(xx - w * 0.5 + lean * 0.4, H * 0.5, xx - w / 2 + lean, -10);
          ctx.closePath();
          ctx.fill();
          // Bark grooves
          ctx.strokeStyle = rgba(darkColor, 0.55);
          ctx.lineWidth = 1.6;
          const grooves = Math.max(3, Math.round(w / 12));
          for (let j = 0; j < grooves; j++) {
            const t = (j + 0.5) / grooves;
            const top = xx - w / 2 + lean + t * w;
            const bottom = xx - w * 0.6 + t * w * 1.2;
            ctx.beginPath();
            ctx.moveTo(top, 0);
            ctx.bezierCurveTo(top - lean * 0.3 + 3, H * 0.35, bottom + 3, H * 0.6, bottom, H - 110);
            ctx.stroke();
          }
          // Moss creeping up the shaded side from the roots.
          ctx.fillStyle = rgba(b.moss, 0.32);
          ctx.beginPath();
          ctx.moveTo(xx - w * 0.62, H - 110);
          const mossTop = H - 200 - rnd() * 220;
          ctx.bezierCurveTo(
            xx - w * 0.55,
            mossTop + 80,
            xx - w * 0.5 + lean * 0.2,
            mossTop + 20,
            xx - w * 0.42 + lean * 0.25,
            mossTop,
          );
          ctx.bezierCurveTo(
            xx - w * 0.2 + lean * 0.2,
            mossTop + 60,
            xx - w * 0.25,
            H - 160,
            xx - w * 0.1,
            H - 110,
          );
          ctx.closePath();
          ctx.fill();
          // Bracket fungus
          if (rnd() < 0.6) {
            ctx.fillStyle = b.night ? rgba(b.accent2, 0.8) : shade(b.dirtLight, 0.35);
            const fy = H - 180 - rnd() * 160;
            for (let f = 0; f < 3; f++) {
              ellipse(ctx, xx + w * 0.45 + lean * ((H - fy) / H) * -0.5, fy + f * 9, 9 - f * 2, 3);
              ctx.fill();
            }
          }
          // Hanging vine
          if (rnd() < 0.6) {
            ctx.strokeStyle = rgba(b.moss, 0.8);
            ctx.lineWidth = 2;
            const vx = xx + w * 0.25 + lean;
            ctx.beginPath();
            ctx.moveTo(vx, 0);
            ctx.bezierCurveTo(vx + 12, 70, vx - 8, 140, vx + 4, 190 + rnd() * 90);
            ctx.stroke();
          }
        };
        wrapDraw(x, w * 1.9, W, draw);
      });
    },
    1,
  );
  return { key: k, width: W, height: H };
}

export function brushTexture(scene: Phaser.Scene, stage: StageId): LayerSpec {
  const b = BIOMES[stage];
  const k = key(stage, 'brush');
  const H = 130;
  ensureTexture(
    scene,
    k,
    LAYER_W,
    H,
    (ctx) => {
      const rnd = artRandom(5 + stage.length * 7);
      ctx.fillStyle = shade(b.brush, -0.15);
      ctx.fillRect(0, H - 40, LAYER_W, 40);
      for (let i = 0; i < 60; i++) {
        const x = rnd() * LAYER_W;
        const r = 18 + rnd() * 30;
        const y = H - 30 - rnd() * 30;
        wrapDraw(x, r * 1.3, LAYER_W, (xx) =>
          canopy(ctx, xx, y, r, b.brush, b.brushLight, rnd, 0.7),
        );
      }
      // Fern fronds
      ctx.strokeStyle = b.brushLight;
      ctx.lineWidth = 2;
      for (let i = 0; i < 40; i++) {
        const x = rnd() * LAYER_W;
        const len = 30 + rnd() * 30;
        const dir = rnd() < 0.5 ? -1 : 1;
        wrapDraw(x, len, LAYER_W, (xx) => {
          ctx.beginPath();
          ctx.moveTo(xx, H - 20);
          ctx.quadraticCurveTo(
            xx + dir * len * 0.4,
            H - 20 - len,
            xx + dir * len,
            H - 30 - len * 0.6,
          );
          ctx.stroke();
        });
      }
    },
    1,
  );
  return { key: k, width: LAYER_W, height: H };
}

export function fogTexture(scene: Phaser.Scene, stage: StageId): LayerSpec {
  const b = BIOMES[stage];
  const k = key(stage, 'fog');
  const H = 220;
  ensureTexture(
    scene,
    k,
    LAYER_W,
    H,
    (ctx) => {
      const rnd = artRandom(91 + stage.length);
      for (let i = 0; i < 40; i++) {
        const x = rnd() * LAYER_W;
        const y = 60 + rnd() * 120;
        const rx = 80 + rnd() * 140;
        const ry = 20 + rnd() * 40;
        wrapDraw(x, rx, LAYER_W, (xx) => {
          ctx.save();
          ctx.translate(xx, y);
          ctx.scale(1, ry / rx);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
          g.addColorStop(0, rgba(b.fog, 0.32));
          g.addColorStop(1, rgba(b.fog, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, rx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }
    },
    1,
  );
  return { key: k, width: LAYER_W, height: H };
}

export function rayTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'fx-ray', 160, 900, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w * 0.42, 0);
    ctx.lineTo(w * 0.58, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  });
}

export function vignetteTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'fx-vignette', 640, 360, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.35, w / 2, h / 2, w * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(6,10,8,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

export function biome(stage: StageId): BiomePalette {
  return BIOMES[stage];
}
