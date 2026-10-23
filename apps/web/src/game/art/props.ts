/**
 * Procedural sprites for obstacles, collectibles, the fireball and particles.
 * Gameplay objects get a dark outline and warm rim light so they separate
 * clearly from the softer, outline-free background layers.
 */
import type * as Phaser from 'phaser';
import type { StageId } from '@dbfc/shared';
import { PPM } from '../constants';
import { BIOMES } from './biomes';
import { artRandom, ellipse, ensureTexture, smoothPath } from './canvas';
import { rgba, shade } from './color';

export interface PropTexture {
  key: string;
  /** Logical texture size. */
  w: number;
  h: number;
  /** Origin (0..1) that maps to the obstacle box's bottom-left corner. */
  ox: number;
  oy: number;
  /** Logical width of the collision box the texture was drawn for. */
  boxW: number;
}

const OUTLINE = '#1a120c';

function prop(
  scene: Phaser.Scene,
  key: string,
  boxWm: number,
  boxHm: number,
  pad: number,
  draw: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void,
  extraTop = 0,
): PropTexture {
  const bw = boxWm * PPM;
  const bh = boxHm * PPM;
  const w = bw + pad * 2;
  const h = bh + pad * 2 + extraTop;
  ensureTexture(scene, key, w, h, (ctx) => draw(ctx, pad, pad + extraTop, bw, bh));
  return { key, w, h, ox: pad / w, oy: (pad + extraTop + bh) / h, boxW: bw };
}

function outline(ctx: CanvasRenderingContext2D, width = 2): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = OUTLINE;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

// ------------------------------------------------------------------ Obstacles

export function logTexture(scene: Phaser.Scene, stage: StageId, variant: number): PropTexture {
  const b = BIOMES[stage];
  return prop(scene, `ob-log-${stage}-${variant}`, 1.4, 0.8, 8, (ctx, x, y, w, h) => {
    const rnd = artRandom(variant * 17 + 3);
    const r = h / 2;
    // Body
    ctx.beginPath();
    ctx.moveTo(x + r * 0.6, y);
    ctx.lineTo(x + w - r * 0.5, y + 1);
    ctx.quadraticCurveTo(x + w + 2, y + h / 2, x + w - r * 0.5, y + h);
    ctx.lineTo(x + r * 0.6, y + h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(b.trunk, 0.22));
    g.addColorStop(0.5, b.trunk);
    g.addColorStop(1, b.trunkDark);
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx);
    // Bark lines
    ctx.strokeStyle = rgba(b.trunkDark, 0.8);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const ly = y + 6 + (i * (h - 12)) / 3;
      ctx.beginPath();
      ctx.moveTo(x + r, ly);
      ctx.bezierCurveTo(x + w * 0.4, ly + 2, x + w * 0.6, ly - 2, x + w - r * 0.6, ly + 1);
      ctx.stroke();
    }
    // Cut end with growth rings
    ellipse(ctx, x + r * 0.6, y + h / 2, r * 0.62, r);
    ctx.fillStyle = shade(b.dirtLight, 0.35);
    ctx.fill();
    outline(ctx);
    ctx.strokeStyle = rgba(b.trunk, 0.7);
    ctx.lineWidth = 1;
    for (const k of [0.65, 0.4, 0.18]) {
      ellipse(ctx, x + r * 0.6, y + h / 2, r * 0.62 * k, r * k);
      ctx.stroke();
    }
    // Moss blanket on top
    ctx.fillStyle = b.moss;
    smoothPath(
      ctx,
      [
        [x + r, y + 2],
        [x + w * 0.3, y - 4 - rnd() * 3],
        [x + w * 0.55, y - 2],
        [x + w * 0.8, y - 5 - rnd() * 3],
        [x + w - r * 0.4, y + 3],
        [x + w * 0.5, y + 7],
      ],
      true,
    );
    ctx.fill();
    ctx.fillStyle = rgba('#fff6c8', 0.25);
    ctx.fillRect(x + w * 0.25, y - 2, w * 0.4, 2);
  });
}

export function rockTexture(scene: Phaser.Scene, stage: StageId, variant: number): PropTexture {
  const b = BIOMES[stage];
  return prop(scene, `ob-rock-${stage}-${variant}`, 1.0, 0.65, 8, (ctx, x, y, w, h) => {
    const rnd = artRandom(variant * 31 + 7);
    const pts: [number, number][] = [
      [x + 2, y + h],
      [x - 1, y + h * 0.55],
      [x + w * 0.18, y + h * 0.12 + rnd() * 4],
      [x + w * 0.5, y - 2],
      [x + w * 0.82, y + h * 0.15 + rnd() * 4],
      [x + w + 1, y + h * 0.6],
      [x + w - 2, y + h],
    ];
    smoothPath(ctx, pts, true);
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, shade(b.stone, 0.25));
    g.addColorStop(1, shade(b.stone, -0.35));
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx);
    ctx.strokeStyle = rgba('#1a1a14', 0.45);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.35, y + h * 0.2);
    ctx.lineTo(x + w * 0.45, y + h * 0.55);
    ctx.lineTo(x + w * 0.38, y + h * 0.85);
    ctx.stroke();
    ctx.fillStyle = b.moss;
    ellipse(ctx, x + w * 0.42, y + h * 0.12, w * 0.3, h * 0.14);
    ctx.fill();
  });
}

export function trunkTexture(scene: Phaser.Scene, stage: StageId, variant: number): PropTexture {
  const b = BIOMES[stage];
  return prop(scene, `ob-trunk-${stage}-${variant}`, 1.2, 1.3, 10, (ctx, x, y, w, h) => {
    const rnd = artRandom(variant * 13 + 5);
    ctx.beginPath();
    ctx.moveTo(x - 4, y + h);
    ctx.lineTo(x + 3, y + h * 0.2);
    // Jagged broken top
    const teeth = 5;
    for (let i = 0; i <= teeth; i++) {
      const tx = x + 3 + ((w - 6) * i) / teeth;
      ctx.lineTo(tx, y + (i % 2 === 0 ? h * 0.08 : -2 - rnd() * 6));
    }
    ctx.lineTo(x + w - 3, y + h * 0.2);
    ctx.lineTo(x + w + 5, y + h);
    ctx.closePath();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(b.trunk, 0.2));
    g.addColorStop(0.5, b.trunk);
    g.addColorStop(1, b.trunkDark);
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx);
    ctx.strokeStyle = rgba(b.trunkDark, 0.8);
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) {
      const gx = x + (w * i) / 4;
      ctx.beginPath();
      ctx.moveTo(gx, y + h * 0.15);
      ctx.bezierCurveTo(gx + 3, y + h * 0.5, gx - 3, y + h * 0.7, gx, y + h);
      ctx.stroke();
    }
    ctx.fillStyle = b.moss;
    ellipse(ctx, x + w * 0.25, y + h * 0.7, w * 0.22, h * 0.18);
    ctx.fill();
    ellipse(ctx, x + w * 0.7, y + h * 0.9, w * 0.3, h * 0.1);
    ctx.fill();
    // Shelf fungus
    ctx.fillStyle = b.night ? b.accent2 : shade(b.accent, -0.1);
    ellipse(ctx, x + w * 0.85, y + h * 0.45, 7, 3);
    ctx.fill();
    ellipse(ctx, x + w * 0.9, y + h * 0.52, 5, 2.4);
    ctx.fill();
  });
}

export function branchTexture(scene: Phaser.Scene, stage: StageId, variant: number): PropTexture {
  const b = BIOMES[stage];
  // Box spans 1.0 m → 3.9 m above ground. A gnarled limb sweeps down from a
  // tree beyond the top of the screen; its leaves mark the 1.0 m clearance.
  return prop(
    scene,
    `ob-branch-${stage}-${variant}`,
    2.4,
    3.9,
    10,
    (ctx, x, y, w, h) => {
      const rnd = artRandom(variant * 7 + 11);
      const low = y + h - 1.0 * PPM;
      // Limb
      ctx.beginPath();
      ctx.moveTo(x + w + 14, y - 40);
      ctx.bezierCurveTo(x + w * 0.95, low - 90, x + w * 0.55, low - 30, x - 10, low - 27);
      ctx.quadraticCurveTo(x - 16, low - 20, x - 10, low - 12);
      ctx.bezierCurveTo(x + w * 0.5, low - 12, x + w * 0.82, low - 56, x + w - 10, y - 40);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, low - 60, 0, low);
      g.addColorStop(0, shade(b.trunk, 0.3));
      g.addColorStop(1, shade(b.trunkDark, -0.1));
      ctx.fillStyle = g;
      ctx.fill();
      outline(ctx);
      // Bark texture
      ctx.strokeStyle = rgba(b.trunkDark, 0.8);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.85, low - 70);
      ctx.bezierCurveTo(x + w * 0.6, low - 30, x + w * 0.3, low - 22, x + 4, low - 20);
      ctx.stroke();
      // Twigs
      ctx.strokeStyle = shade(b.trunk, 0.1);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      for (const [tx, ty, dx, dy] of [
        [0.25, -24, -10, -16],
        [0.55, -30, 6, -18],
        [0.75, -48, 12, -12],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(x + w * tx, low + ty);
        ctx.lineTo(x + w * tx + dx, low + ty + dy);
        ctx.stroke();
      }
      // Leaf clumps hanging down to the clearance line.
      for (let i = 0; i < 6; i++) {
        const lx = x + 2 + (i / 5) * (w - 6);
        const ly = low - 12 - rnd() * 6;
        ctx.fillStyle = b.nearLight;
        ellipse(ctx, lx + 2, ly - 3, 12, 9);
        ctx.fill();
        ctx.fillStyle = b.moss;
        ellipse(ctx, lx - 1, ly + 1, 11, 8);
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = OUTLINE;
        ctx.stroke();
      }
      // Leaf tips along the bottom edge.
      ctx.fillStyle = shade(b.moss, -0.1);
      for (let i = 0; i < 10; i++) {
        const lx = x + 2 + (i / 9) * (w - 4);
        ctx.beginPath();
        ctx.moveTo(lx - 4, low - 8);
        ctx.quadraticCurveTo(lx, low + 2, lx + 4, low - 8);
        ctx.closePath();
        ctx.fill();
      }
    },
    40,
  );
}

export function thornsTexture(
  scene: Phaser.Scene,
  stage: StageId,
  variant: number,
  burned = false,
): PropTexture {
  const b = BIOMES[stage];
  return prop(
    scene,
    `ob-thorns-${stage}-${variant}-${burned ? 'b' : 'n'}`,
    2.4,
    0.75,
    10,
    (ctx, x, y, w, h) => {
      const rnd = artRandom(variant * 23 + 9);
      const body = burned ? '#2a1d17' : shade(b.trunkDark, 0.1);
      const vine = burned ? '#3b2a22' : '#5a2f24';
      // Bramble mass
      ctx.fillStyle = body;
      smoothPath(
        ctx,
        [
          [x, y + h],
          [x + w * 0.05, y + h * 0.4],
          [x + w * 0.25, y + h * 0.1],
          [x + w * 0.5, y - 2],
          [x + w * 0.75, y + h * 0.08],
          [x + w * 0.96, y + h * 0.4],
          [x + w, y + h],
        ],
        true,
      );
      ctx.fill();
      outline(ctx);
      // Curling thorny vines
      ctx.strokeStyle = vine;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const sx = x + rnd() * w;
        ctx.beginPath();
        ctx.moveTo(sx, y + h);
        ctx.bezierCurveTo(
          sx - 14 + rnd() * 28,
          y + h * 0.5,
          sx - 20 + rnd() * 40,
          y,
          sx - 10 + rnd() * 20,
          y + h * 0.2,
        );
        ctx.stroke();
      }
      // Spikes
      ctx.fillStyle = burned ? '#4a3a30' : '#e9d9b0';
      for (let i = 0; i < 26; i++) {
        const sx = x + 4 + rnd() * (w - 8);
        const sy = y + 4 + rnd() * (h - 8);
        const a = rnd() * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * 6, sy + Math.sin(a) * 6);
        ctx.lineTo(sx + Math.cos(a + 2.4) * 2, sy + Math.sin(a + 2.4) * 2);
        ctx.lineTo(sx + Math.cos(a - 2.4) * 2, sy + Math.sin(a - 2.4) * 2);
        ctx.closePath();
        ctx.fill();
      }
      if (burned) {
        ctx.fillStyle = 'rgba(255,120,40,0.75)';
        for (let i = 0; i < 10; i++) {
          ellipse(ctx, x + rnd() * w, y + h * 0.4 + rnd() * h * 0.6, 2, 1.5);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = b.night ? '#c94d6a' : '#b8323f';
        for (let i = 0; i < 6; i++) {
          ellipse(ctx, x + 8 + rnd() * (w - 16), y + 6 + rnd() * (h - 10), 2.6, 2.6);
          ctx.fill();
        }
      }
    },
  );
}

export function rootsTexture(scene: Phaser.Scene, stage: StageId, variant: number): PropTexture {
  const b = BIOMES[stage];
  return prop(scene, `ob-roots-${stage}-${variant}`, 2.0, 0.38, 8, (ctx, x, y, w, h) => {
    const rnd = artRandom(variant * 5 + 2);
    for (let i = 0; i < 5; i++) {
      const sx = x + rnd() * w * 0.4;
      const ex = x + w * 0.5 + rnd() * w * 0.5;
      const peak = y + rnd() * h * 0.5;
      ctx.beginPath();
      ctx.moveTo(sx, y + h + 2);
      ctx.bezierCurveTo(
        sx + (ex - sx) * 0.3,
        peak - 4,
        sx + (ex - sx) * 0.7,
        peak - 4,
        ex,
        y + h + 2,
      );
      ctx.lineWidth = 7 - i * 0.8;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 4.5 - i * 0.6;
      ctx.strokeStyle = i % 2 === 0 ? shade(b.trunk, 0.15) : b.trunk;
      ctx.stroke();
    }
    ctx.fillStyle = b.moss;
    ellipse(ctx, x + w * 0.5, y + h * 0.35, 8, 3);
    ctx.fill();
  });
}

export function mudTexture(scene: Phaser.Scene, stage: StageId): PropTexture {
  const b = BIOMES[stage];
  return prop(scene, `ob-mud-${stage}`, 5.0, 0.12, 6, (ctx, x, y, w, h) => {
    const mid = y + h;
    ctx.fillStyle = shade(b.dirtDark, -0.25);
    smoothPath(
      ctx,
      [
        [x - 4, mid],
        [x + w * 0.1, mid - 5],
        [x + w * 0.5, mid - 6],
        [x + w * 0.9, mid - 5],
        [x + w + 4, mid],
        [x + w * 0.9, mid + 5],
        [x + w * 0.5, mid + 6],
        [x + w * 0.1, mid + 5],
      ],
      true,
    );
    ctx.fill();
    ctx.fillStyle = rgba('#d8c9a0', 0.35);
    for (let i = 0; i < 6; i++) {
      ellipse(ctx, x + w * (0.12 + i * 0.15), mid - 2, 7, 1.4);
      ctx.fill();
    }
    ctx.fillStyle = rgba('#000', 0.25);
    for (let i = 0; i < 5; i++) {
      ellipse(ctx, x + w * (0.2 + i * 0.16), mid + 2, 2.5, 1.5);
      ctx.fill();
    }
  });
}

export function boulderTexture(scene: Phaser.Scene, stage: StageId): PropTexture {
  const b = BIOMES[stage];
  return prop(scene, `ob-boulder-${stage}`, 1.1, 1.05, 6, (ctx, x, y, w, h) => {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2 + 1;
    ellipse(ctx, cx, cy, r, r);
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, shade(b.stone, 0.3));
    g.addColorStop(1, shade(b.stone, -0.45));
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx, 2.2);
    ctx.strokeStyle = rgba('#141410', 0.55);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.6, cy - r * 0.1);
    ctx.lineTo(cx - r * 0.1, cy + r * 0.05);
    ctx.lineTo(cx + r * 0.15, cy + r * 0.5);
    ctx.moveTo(cx - r * 0.1, cy + r * 0.05);
    ctx.lineTo(cx + r * 0.55, cy - r * 0.35);
    ctx.stroke();
    ctx.fillStyle = b.moss;
    ellipse(ctx, cx + r * 0.2, cy - r * 0.62, r * 0.4, r * 0.18, 0.3);
    ctx.fill();
    ellipse(ctx, cx - r * 0.55, cy + r * 0.45, r * 0.22, r * 0.12, -0.6);
    ctx.fill();
  });
}

export function swingLogTexture(scene: Phaser.Scene, stage: StageId): PropTexture {
  const b = BIOMES[stage];
  return prop(scene, `ob-swing-${stage}`, 1.3, 0.55, 8, (ctx, x, y, w, h) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(b.trunk, 0.25));
    g.addColorStop(1, b.trunkDark);
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx);
    // Rope bindings
    ctx.strokeStyle = '#c9a66b';
    ctx.lineWidth = 3;
    for (const fx of [0.22, 0.78]) {
      ctx.beginPath();
      ctx.moveTo(x + w * fx, y - 1);
      ctx.lineTo(x + w * fx, y + h + 1);
      ctx.stroke();
    }
    ctx.fillStyle = b.moss;
    ellipse(ctx, x + w * 0.5, y + 3, w * 0.25, 3);
    ctx.fill();
  });
}

export function snareTextures(
  scene: Phaser.Scene,
  stage: StageId,
): { ring: PropTexture; flame: PropTexture } {
  const b = BIOMES[stage];
  const glyph = b.night ? b.accent2 : '#7fd1b4';
  const ring = prop(scene, `ob-snare-ring-${stage}`, 1.6, 0.12, 8, (ctx, x, y, w, h) => {
    const cy = y + h;
    ellipse(ctx, x + w / 2, cy, w / 2, 7);
    ctx.fillStyle = rgba('#0c1412', 0.6);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = glyph;
    ctx.stroke();
    // Runes
    ctx.fillStyle = glyph;
    for (let i = 0; i < 7; i++) {
      const gx = x + 8 + (i / 6) * (w - 16);
      ctx.fillRect(gx - 1, cy - 3, 2, 6);
      ctx.fillRect(gx - 3, cy - (i % 2 ? 1 : 3), 6, 1.5);
    }
  });
  const flame = prop(scene, `ob-snare-flame-${stage}`, 1.6, 1.15, 10, (ctx, x, y, w, h) => {
    const rnd = artRandom(4);
    for (let layer = 0; layer < 3; layer++) {
      const color = ['#f2b85a', '#f6d68c', '#fff4d0'][layer]!;
      const shrink = layer * 0.18;
      ctx.fillStyle = rgba(color, 0.9);
      ctx.beginPath();
      ctx.moveTo(x + w * shrink * 0.5, y + h);
      const tongues = 5;
      for (let i = 0; i <= tongues; i++) {
        const tx = x + w * shrink * 0.5 + (w * (1 - shrink) * i) / tongues;
        const peak = y + h * (layer * 0.22) + rnd() * h * 0.12;
        ctx.quadraticCurveTo(tx - 6, y + h * 0.5, tx, i % 2 === 0 ? peak : y + h * 0.45);
      }
      ctx.lineTo(x + w - w * shrink * 0.5, y + h);
      ctx.closePath();
      ctx.fill();
    }
  });
  return { ring, flame };
}

export function bridgeTexture(
  scene: Phaser.Scene,
  stage: StageId,
  side: 'left' | 'right',
): PropTexture {
  const b = BIOMES[stage];
  return prop(scene, `ob-bridge-${side}-${stage}`, 1.2, 1.6, 6, (ctx, x, y, w, h) => {
    const dir = side === 'left' ? 1 : -1;
    const ax = side === 'left' ? x : x + w;
    // Rope
    ctx.strokeStyle = '#c9a66b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, y + 2);
    ctx.quadraticCurveTo(ax + dir * w * 0.5, y + h * 0.3, ax + dir * w * 0.7, y + h * 0.8);
    ctx.stroke();
    // Dangling planks
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4;
      const px = ax + dir * w * 0.7 * t;
      const py = y + 2 + h * 0.75 * t * t;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(dir * (0.4 + t * 0.9));
      ctx.fillStyle = i % 2 === 0 ? shade(b.trunk, 0.25) : shade(b.trunk, 0.1);
      ctx.fillRect(-8, -3, 16, 6);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-8, -3, 16, 6);
      ctx.restore();
    }
    // Post
    ctx.fillStyle = b.trunkDark;
    ctx.fillRect(ax - (side === 'left' ? 4 : -0), y - 18, 5, 24);
  });
}

// ---------------------------------------------------------------- Pickups

export function orbTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'pk-orb', 40, 40, (ctx) => {
    const g = ctx.createRadialGradient(20, 20, 0, 20, 20, 20);
    g.addColorStop(0, 'rgba(255,240,190,1)');
    g.addColorStop(0.28, 'rgba(255,196,92,0.95)');
    g.addColorStop(0.5, 'rgba(232,122,46,0.45)');
    g.addColorStop(1, 'rgba(232,122,46,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 40, 40);
    ellipse(ctx, 20, 20, 6.5, 6.5);
    ctx.fillStyle = '#ffd56e';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#8a3d12';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ellipse(ctx, 18, 17.5, 2.2, 1.6);
    ctx.fill();
  });
}

export function crystalTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'pk-crystal', 34, 42, (ctx) => {
    const g = ctx.createRadialGradient(17, 22, 0, 17, 22, 20);
    g.addColorStop(0, 'rgba(160,240,210,0.6)');
    g.addColorStop(1, 'rgba(160,240,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 34, 42);
    ctx.beginPath();
    ctx.moveTo(17, 5);
    ctx.lineTo(27, 17);
    ctx.lineTo(22, 37);
    ctx.lineTo(12, 37);
    ctx.lineTo(7, 17);
    ctx.closePath();
    ctx.fillStyle = '#5fc9a2';
    ctx.fill();
    outline(ctx, 1.6);
    ctx.fillStyle = '#b6f3dc';
    ctx.beginPath();
    ctx.moveTo(17, 5);
    ctx.lineTo(20, 17);
    ctx.lineTo(17, 37);
    ctx.lineTo(12, 37);
    ctx.lineTo(7, 17);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(12, 14, 2, 8);
  });
}

export function shieldPickupTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'pk-shield', 44, 44, (ctx) => {
    ellipse(ctx, 22, 22, 20, 20);
    ctx.fillStyle = 'rgba(169,194,122,0.25)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(217,180,90,0.9)';
    ctx.stroke();
    drawLeafShield(ctx, 22, 23, 12);
  });
}

export function drawLeafShield(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.quadraticCurveTo(cx + s, cy - s * 0.8, cx + s * 0.85, cy);
  ctx.quadraticCurveTo(cx + s * 0.6, cy + s * 0.8, cx, cy + s * 1.1);
  ctx.quadraticCurveTo(cx - s * 0.6, cy + s * 0.8, cx - s * 0.85, cy);
  ctx.quadraticCurveTo(cx - s, cy - s * 0.8, cx, cy - s);
  ctx.closePath();
  ctx.fillStyle = '#6d9a4a';
  ctx.fill();
  outline(ctx, 1.6);
  ctx.strokeStyle = '#d9b45a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.8);
  ctx.lineTo(cx, cy + s * 0.9);
  for (const k of [-0.35, 0.05, 0.45]) {
    ctx.moveTo(cx, cy + s * k);
    ctx.lineTo(cx + s * 0.5, cy + s * (k - 0.3));
    ctx.moveTo(cx, cy + s * k);
    ctx.lineTo(cx - s * 0.5, cy + s * (k - 0.3));
  }
  ctx.stroke();
}

export function boostPickupTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'pk-boost', 44, 44, (ctx) => {
    ellipse(ctx, 22, 22, 20, 20);
    ctx.fillStyle = 'rgba(242,184,90,0.22)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(242,184,90,0.9)';
    ctx.stroke();
    drawFeather(ctx, 22, 22, 13);
  });
}

export function drawFeather(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.7);
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.55, -s * 0.3, s * 0.1, s);
  ctx.quadraticCurveTo(-s * 0.55, -s * 0.2, 0, -s);
  ctx.closePath();
  ctx.fillStyle = '#ef7a3e';
  ctx.fill();
  outline(ctx, 1.4);
  ctx.strokeStyle = '#fff1c2';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.8);
  ctx.lineTo(s * 0.08, s * 1.15);
  ctx.stroke();
  ctx.restore();
}

export function scaleTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'pk-scale', 48, 52, (ctx) => {
    const g = ctx.createRadialGradient(24, 26, 0, 24, 26, 24);
    g.addColorStop(0, 'rgba(255,220,120,0.65)');
    g.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 48, 52);
    ctx.beginPath();
    ctx.moveTo(24, 8);
    ctx.quadraticCurveTo(40, 14, 37, 30);
    ctx.quadraticCurveTo(33, 42, 24, 46);
    ctx.quadraticCurveTo(15, 42, 11, 30);
    ctx.quadraticCurveTo(8, 14, 24, 8);
    ctx.closePath();
    const sg = ctx.createLinearGradient(12, 8, 36, 46);
    sg.addColorStop(0, '#ffe7a3');
    sg.addColorStop(0.5, '#d9a441');
    sg.addColorStop(1, '#8a5c18');
    ctx.fillStyle = sg;
    ctx.fill();
    outline(ctx, 1.8);
    ctx.strokeStyle = 'rgba(90,50,10,0.6)';
    ctx.lineWidth = 1.2;
    for (const yy of [20, 28, 36]) {
      ctx.beginPath();
      ctx.moveTo(16, yy);
      ctx.quadraticCurveTo(24, yy + 5, 32, yy);
      ctx.stroke();
    }
  });
}

// ---------------------------------------------------------------- Fireball & FX

export function fireballTextures(scene: Phaser.Scene): {
  glow: string;
  core: string;
  tongue: string;
} {
  const glow = ensureTexture(scene, 'fb-glow', 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,200,110,0.6)');
    g.addColorStop(0.3, 'rgba(255,130,50,0.25)');
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
  // White-hot heart of a living flame (deliberately not a decorated sphere).
  const core = ensureTexture(scene, 'fb-core', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(34, 30, 0, 32, 32, 30);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.28, '#fff4c9');
    g.addColorStop(0.55, '#ffc65a');
    g.addColorStop(0.8, 'rgba(255,128,44,0.55)');
    g.addColorStop(1, 'rgba(255,110,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  // Flame tongue lying horizontally: base on the right, tip streaming left.
  const tongue = ensureTexture(scene, 'fb-tongue', 110, 44, (ctx) => {
    const g = ctx.createLinearGradient(110, 0, 0, 0);
    g.addColorStop(0, 'rgba(255,236,170,0.95)');
    g.addColorStop(0.35, 'rgba(255,170,70,0.85)');
    g.addColorStop(0.75, 'rgba(226,98,43,0.45)');
    g.addColorStop(1, 'rgba(194,78,31,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(104, 8);
    ctx.bezierCurveTo(70, 2, 46, 14, 2, 22);
    ctx.bezierCurveTo(40, 26, 66, 40, 104, 36);
    ctx.quadraticCurveTo(112, 22, 104, 8);
    ctx.closePath();
    ctx.fill();
  });
  return { glow, core, tongue };
}

export function particleTextures(scene: Phaser.Scene): void {
  ensureTexture(scene, 'p-dot', 16, 16, (ctx) => {
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 16);
  });
  ensureTexture(scene, 'p-spark', 14, 4, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 14, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 14, 4);
  });
  ensureTexture(scene, 'p-leaf', 12, 8, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(1, 4);
    ctx.quadraticCurveTo(6, -1, 11, 4);
    ctx.quadraticCurveTo(6, 9, 1, 4);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });
  ensureTexture(scene, 'p-puff', 24, 24, (ctx) => {
    const g = ctx.createRadialGradient(12, 12, 0, 12, 12, 12);
    g.addColorStop(0, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 24, 24);
  });
  ensureTexture(scene, 'p-ring', 64, 64, (ctx) => {
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ellipse(ctx, 32, 32, 28, 28);
    ctx.stroke();
  });
  ensureTexture(scene, 'fx-shadow', 64, 16, (ctx) => {
    const g = ctx.createRadialGradient(32, 8, 0, 32, 8, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.scale(1, 0.25);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ensureTexture(scene, 'fx-shield', 120, 110, (ctx) => {
    ellipse(ctx, 60, 55, 56, 50);
    const g = ctx.createRadialGradient(60, 55, 30, 60, 55, 56);
    g.addColorStop(0, 'rgba(169,194,122,0.05)');
    g.addColorStop(0.8, 'rgba(169,214,122,0.28)');
    g.addColorStop(1, 'rgba(217,180,90,0.7)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,210,140,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Leaf-vein lattice
    ctx.strokeStyle = 'rgba(232,210,140,0.35)';
    ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(60 + i * 14, 8);
      ctx.quadraticCurveTo(60 + i * 18, 55, 60 + i * 14, 102);
      ctx.stroke();
    }
  });
}
