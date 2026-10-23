/**
 * Procedural dragon parts (drawn facing right). Each part has a pivot that the
 * DragonRig uses as its joint. Skins only change the palette.
 */
import type * as Phaser from 'phaser';
import { skinById, type DragonPalette } from '@dbfc/shared';
import { ensureTexture, smoothPath, ellipse } from './canvas';
import { rgba, shade } from './color';

export interface PartSpec {
  key: string;
  w: number;
  h: number;
  /** Pivot in logical px within the texture. */
  px: number;
  py: number;
}

const OUTLINE = '#1b0f0a';

function stroke(ctx: CanvasRenderingContext2D, width = 1.8): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function part(
  scene: Phaser.Scene,
  skin: string,
  name: string,
  w: number,
  h: number,
  px: number,
  py: number,
  draw: (ctx: CanvasRenderingContext2D, p: DragonPalette) => void,
): PartSpec {
  const key = `dr-${skin}-${name}`;
  const palette = skinById(skin).palette;
  ensureTexture(scene, key, w, h, (ctx) => draw(ctx, palette));
  return { key, w, h, px, py };
}

export interface DragonParts {
  body: PartSpec;
  neck: PartSpec;
  head: PartSpec;
  wingNear: PartSpec;
  wingFar: PartSpec;
  legFrontNear: PartSpec;
  legFrontFar: PartSpec;
  legBackNear: PartSpec;
  legBackFar: PartSpec;
  tail: PartSpec[];
  tailTip: PartSpec;
}

function wing(ctx: CanvasRenderingContext2D, p: DragonPalette, far: boolean) {
  const membrane = far ? shade(p.wingShade, -0.15) : p.wing;
  const bone = far ? shade(p.bodyShade, -0.2) : p.bodyShade;
  // Shoulder at (10, 54); wing sweeps up and back (to the left).
  const sx = 62;
  const sy = 56;
  const wrist: [number, number] = [40, 10];
  const tips: [number, number][] = [
    [4, 6],
    [2, 30],
    [12, 48],
  ];
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(wrist[0], wrist[1]);
  ctx.lineTo(tips[0]![0], tips[0]![1]);
  ctx.quadraticCurveTo(14, 20, tips[1]![0], tips[1]![1]);
  ctx.quadraticCurveTo(18, 40, tips[2]![0], tips[2]![1]);
  ctx.quadraticCurveTo(34, 50, sx - 4, sy + 2);
  ctx.closePath();
  const g = ctx.createLinearGradient(wrist[0], wrist[1], sx, sy);
  g.addColorStop(0, shade(membrane, far ? 0 : 0.12));
  g.addColorStop(1, shade(membrane, -0.25));
  ctx.fillStyle = g;
  ctx.fill();
  stroke(ctx, 1.6);
  ctx.strokeStyle = bone;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(wrist[0], wrist[1]);
  ctx.stroke();
  ctx.lineWidth = 1.8;
  for (const t of tips) {
    ctx.beginPath();
    ctx.moveTo(wrist[0], wrist[1]);
    ctx.lineTo(t[0], t[1]);
    ctx.stroke();
  }
  // Wrist claw
  ctx.fillStyle = p.horn;
  ctx.beginPath();
  ctx.moveTo(wrist[0], wrist[1]);
  ctx.lineTo(wrist[0] + 6, wrist[1] - 6);
  ctx.lineTo(wrist[0] + 4, wrist[1] + 2);
  ctx.closePath();
  ctx.fill();
}

function leg(ctx: CanvasRenderingContext2D, p: DragonPalette, back: boolean, far: boolean) {
  const skin = far ? shade(p.bodyShade, -0.1) : p.body;
  const shadeC = far ? shade(p.bodyShade, -0.35) : p.bodyShade;
  if (back) {
    // Hip pivot at (13, 6). Thigh, shin, foot.
    smoothPath(
      ctx,
      [
        [4, 4],
        [22, 2],
        [24, 16],
        [17, 24],
        [19, 32],
        [26, 34],
        [10, 35],
        [9, 26],
        [5, 16],
      ],
      true,
    );
  } else {
    // Shoulder pivot at (9, 5).
    smoothPath(
      ctx,
      [
        [3, 3],
        [15, 2],
        [15, 14],
        [12, 22],
        [18, 29],
        [6, 30],
        [6, 22],
        [3, 12],
      ],
      true,
    );
  }
  const g = ctx.createLinearGradient(0, 0, 24, 0);
  g.addColorStop(0, skin);
  g.addColorStop(1, shadeC);
  ctx.fillStyle = g;
  ctx.fill();
  stroke(ctx, 1.5);
  // Claws
  ctx.fillStyle = far ? shade(p.horn, -0.35) : p.horn;
  const fy = back ? 34 : 29;
  const fx = back ? 26 : 18;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(fx - i * 4, fy - 2);
    ctx.lineTo(fx - i * 4 + 4, fy + 1);
    ctx.lineTo(fx - i * 4, fy + 1.5);
    ctx.closePath();
    ctx.fill();
  }
}

export function dragonParts(scene: Phaser.Scene, skin: string): DragonParts {
  const body = part(scene, skin, 'body', 78, 46, 39, 25, (ctx, p) => {
    // Torso: rounded chest on the right, tapering hips on the left.
    smoothPath(
      ctx,
      [
        [4, 26],
        [12, 12],
        [34, 7],
        [56, 6],
        [72, 14],
        [75, 28],
        [66, 40],
        [44, 42],
        [20, 40],
        [6, 34],
      ],
      true,
    );
    const g = ctx.createLinearGradient(0, 4, 0, 44);
    g.addColorStop(0, shade(p.body, 0.12));
    g.addColorStop(0.55, p.body);
    g.addColorStop(1, p.bodyShade);
    ctx.fillStyle = g;
    ctx.fill();
    stroke(ctx, 2);
    // Belly plates
    ctx.save();
    smoothPath(
      ctx,
      [
        [14, 36],
        [40, 33],
        [66, 31],
        [72, 30],
        [66, 40],
        [44, 42],
        [20, 40],
      ],
      true,
    );
    ctx.fillStyle = p.belly;
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = rgba(shade(p.belly, -0.4), 0.6);
    ctx.lineWidth = 1;
    for (let x = 18; x < 74; x += 7) {
      ctx.beginPath();
      ctx.moveTo(x, 30);
      ctx.quadraticCurveTo(x + 2, 37, x, 44);
      ctx.stroke();
    }
    ctx.restore();
    // Scale highlights
    ctx.fillStyle = rgba(shade(p.body, 0.45), 0.35);
    for (let i = 0; i < 9; i++) {
      ellipse(ctx, 18 + i * 6, 14 + (i % 2) * 5, 2.4, 1.6);
      ctx.fill();
    }
    // Back spines
    ctx.fillStyle = p.spines;
    for (let i = 0; i < 6; i++) {
      const sx = 14 + i * 9;
      const sy = i < 2 ? 11 - i * 2 : 7;
      ctx.beginPath();
      ctx.moveTo(sx - 3, sy + 2);
      ctx.lineTo(sx + 1, sy - 6);
      ctx.lineTo(sx + 4, sy + 2);
      ctx.closePath();
      ctx.fill();
      stroke(ctx, 1);
    }
  });

  const neck = part(scene, skin, 'neck', 34, 34, 6, 28, (ctx, p) => {
    smoothPath(
      ctx,
      [
        [2, 30],
        [4, 16],
        [14, 6],
        [28, 2],
        [32, 10],
        [24, 18],
        [16, 30],
      ],
      true,
    );
    const g = ctx.createLinearGradient(0, 0, 0, 34);
    g.addColorStop(0, shade(p.body, 0.1));
    g.addColorStop(1, p.bodyShade);
    ctx.fillStyle = g;
    ctx.fill();
    stroke(ctx, 1.8);
    ctx.fillStyle = p.belly;
    smoothPath(
      ctx,
      [
        [16, 30],
        [22, 20],
        [30, 11],
        [32, 10],
        [24, 18],
      ],
      true,
    );
    ctx.fill();
    ctx.fillStyle = p.spines;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(6 + i * 7, 14 - i * 4);
      ctx.lineTo(7 + i * 7, 6 - i * 4);
      ctx.lineTo(12 + i * 7, 11 - i * 4);
      ctx.closePath();
      ctx.fill();
    }
  });

  const head = part(scene, skin, 'head', 58, 42, 10, 27, (ctx, p) => {
    // Horns swept back
    ctx.fillStyle = p.horn;
    ctx.beginPath();
    ctx.moveTo(18, 14);
    ctx.quadraticCurveTo(6, 6, 1, 1);
    ctx.quadraticCurveTo(10, 12, 14, 19);
    ctx.closePath();
    ctx.fill();
    stroke(ctx, 1.4);
    ctx.beginPath();
    ctx.moveTo(24, 13);
    ctx.quadraticCurveTo(17, 2, 13, -1);
    ctx.quadraticCurveTo(22, 6, 28, 14);
    ctx.closePath();
    ctx.fill();
    stroke(ctx, 1.4);
    // Skull + snout
    smoothPath(
      ctx,
      [
        [6, 28],
        [10, 16],
        [24, 11],
        [38, 14],
        [52, 18],
        [57, 24],
        [54, 30],
        [40, 34],
        [24, 38],
        [12, 36],
      ],
      true,
    );
    const g = ctx.createLinearGradient(0, 10, 0, 38);
    g.addColorStop(0, shade(p.body, 0.15));
    g.addColorStop(1, p.bodyShade);
    ctx.fillStyle = g;
    ctx.fill();
    stroke(ctx, 1.9);
    // Jaw line and lighter chin
    ctx.fillStyle = p.belly;
    smoothPath(
      ctx,
      [
        [16, 34],
        [34, 31],
        [52, 29],
        [40, 35],
        [24, 38],
      ],
      true,
    );
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(30, 30);
    ctx.quadraticCurveTo(44, 28, 54, 27);
    ctx.stroke();
    // Brow ridge & eye
    ctx.fillStyle = shade(p.bodyShade, -0.2);
    ctx.beginPath();
    ctx.moveTo(22, 17);
    ctx.quadraticCurveTo(30, 13, 38, 17);
    ctx.lineTo(36, 19);
    ctx.quadraticCurveTo(30, 17, 23, 20);
    ctx.closePath();
    ctx.fill();
    ellipse(ctx, 31, 21.5, 4.2, 3.2);
    ctx.fillStyle = p.eye;
    ctx.fill();
    stroke(ctx, 1.1);
    ctx.fillStyle = '#1a0d06';
    ellipse(ctx, 32.2, 21.5, 1.3, 2.6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ellipse(ctx, 30, 20.3, 0.9, 0.8);
    ctx.fill();
    // Nostril
    ctx.fillStyle = OUTLINE;
    ellipse(ctx, 51, 21, 1.4, 1);
    ctx.fill();
    // Cheek frill
    ctx.fillStyle = p.spines;
    ctx.beginPath();
    ctx.moveTo(12, 26);
    ctx.lineTo(4, 30);
    ctx.lineTo(12, 31);
    ctx.lineTo(6, 36);
    ctx.lineTo(15, 34);
    ctx.closePath();
    ctx.fill();
  });

  const wingNear = part(scene, skin, 'wing-near', 70, 62, 62, 56, (ctx, p) => wing(ctx, p, false));
  const wingFar = part(scene, skin, 'wing-far', 70, 62, 62, 56, (ctx, p) => wing(ctx, p, true));
  const legFrontNear = part(scene, skin, 'leg-fn', 22, 34, 9, 5, (ctx, p) =>
    leg(ctx, p, false, false),
  );
  const legFrontFar = part(scene, skin, 'leg-ff', 22, 34, 9, 5, (ctx, p) =>
    leg(ctx, p, false, true),
  );
  const legBackNear = part(scene, skin, 'leg-bn', 30, 38, 13, 6, (ctx, p) =>
    leg(ctx, p, true, false),
  );
  const legBackFar = part(scene, skin, 'leg-bf', 30, 38, 13, 6, (ctx, p) =>
    leg(ctx, p, true, true),
  );

  const segSizes: [number, number][] = [
    [26, 20],
    [24, 17],
    [22, 14],
    [20, 11],
  ];
  const tail = segSizes.map(([w, h], i) =>
    part(scene, skin, `tail-${i}`, w + 4, h + 4, w + 1, (h + 4) / 2, (ctx, p) => {
      const cy = (h + 4) / 2;
      smoothPath(
        ctx,
        [
          [2, cy],
          [w * 0.3, cy - h * 0.42],
          [w + 2, cy - h / 2],
          [w + 2, cy + h / 2],
          [w * 0.3, cy + h * 0.42],
        ],
        true,
      );
      const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
      g.addColorStop(0, shade(p.body, 0.1));
      g.addColorStop(1, p.bodyShade);
      ctx.fillStyle = g;
      ctx.fill();
      stroke(ctx, 1.5);
      ctx.fillStyle = p.spines;
      ctx.beginPath();
      ctx.moveTo(w * 0.35, cy - h * 0.38);
      ctx.lineTo(w * 0.55, cy - h * 0.38 - 5 + i);
      ctx.lineTo(w * 0.72, cy - h * 0.42);
      ctx.closePath();
      ctx.fill();
    }),
  );
  const tailTip = part(scene, skin, 'tail-tip', 26, 22, 24, 11, (ctx, p) => {
    ctx.beginPath();
    ctx.moveTo(24, 8);
    ctx.quadraticCurveTo(14, 6, 2, 1);
    ctx.quadraticCurveTo(8, 9, 4, 11);
    ctx.quadraticCurveTo(8, 13, 2, 21);
    ctx.quadraticCurveTo(14, 16, 24, 14);
    ctx.closePath();
    ctx.fillStyle = p.spines;
    ctx.fill();
    stroke(ctx, 1.5);
    ctx.fillStyle = rgba(p.flame, 0.6);
    ellipse(ctx, 9, 11, 3, 2);
    ctx.fill();
  });

  return {
    body,
    neck,
    head,
    wingNear,
    wingFar,
    legFrontNear,
    legFrontFar,
    legBackNear,
    legBackFar,
    tail,
    tailTip,
  };
}
