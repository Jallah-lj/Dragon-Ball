import type * as Phaser from 'phaser';
import { skinById } from '@dbfc/shared';
import { ellipse, ensureTexture } from './canvas';
import { drawFeather, drawLeafShield } from './props';

const INK = '#1a120c';

function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.3, cy + s * 0.1, cx - s * 0.9, cy - s * 1.0, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.9, cy - s * 1.0, cx + s * 1.3, cy + s * 0.1, cx, cy + s * 0.9);
  ctx.closePath();
}

export function hudTextures(scene: Phaser.Scene, skin: string): void {
  ensureTexture(scene, 'hud-heart', 34, 32, (ctx) => {
    heartPath(ctx, 17, 16, 13);
    const g = ctx.createLinearGradient(0, 4, 0, 30);
    g.addColorStop(0, '#ff8a5c');
    g.addColorStop(1, '#c2361f');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // Scale pattern
    ctx.strokeStyle = 'rgba(255,220,190,0.45)';
    ctx.lineWidth = 1;
    for (const [x, y] of [
      [11, 13],
      [17, 18],
      [23, 13],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ellipse(ctx, 10, 10, 3, 2);
    ctx.fill();
  });
  ensureTexture(scene, 'hud-heart-empty', 34, 32, (ctx) => {
    heartPath(ctx, 17, 16, 13);
    ctx.fillStyle = 'rgba(13,18,14,0.6)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#a8977a';
    ctx.setLineDash([4, 3]);
    ctx.stroke();
  });
  ensureTexture(scene, 'hud-dash', 40, 40, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(20, 4);
    ctx.bezierCurveTo(30, 14, 34, 22, 28, 32);
    ctx.bezierCurveTo(24, 37, 14, 37, 11, 31);
    ctx.bezierCurveTo(7, 24, 12, 18, 15, 14);
    ctx.bezierCurveTo(15, 20, 18, 22, 20, 22);
    ctx.bezierCurveTo(17, 14, 19, 9, 20, 4);
    ctx.closePath();
    ctx.fillStyle = '#ef7a3e';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = '#ffd56e';
    ellipse(ctx, 20, 29, 5, 6);
    ctx.fill();
  });
  ensureTexture(scene, 'hud-leap', 40, 40, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(34, 30);
    ctx.lineTo(22, 6);
    ctx.lineTo(4, 8);
    ctx.quadraticCurveTo(10, 14, 6, 18);
    ctx.quadraticCurveTo(14, 20, 9, 26);
    ctx.quadraticCurveTo(20, 26, 18, 32);
    ctx.closePath();
    ctx.fillStyle = '#a9c27a';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.strokeStyle = '#4f7a3a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(34, 30);
    ctx.lineTo(6, 9);
    ctx.moveTo(30, 25);
    ctx.lineTo(8, 19);
    ctx.moveTo(27, 28);
    ctx.lineTo(12, 27);
    ctx.stroke();
  });
  ensureTexture(scene, 'hud-shield', 40, 40, (ctx) => drawLeafShield(ctx, 20, 19, 14));
  ensureTexture(scene, 'hud-boost', 40, 40, (ctx) => drawFeather(ctx, 20, 20, 15));
  ensureTexture(scene, 'hud-lock', 24, 24, (ctx) => {
    ctx.strokeStyle = '#e6d6b2';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(12, 10, 5, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#e6d6b2';
    ctx.fillRect(5, 10, 14, 10);
    ctx.fillStyle = INK;
    ctx.fillRect(11, 13, 2, 4);
  });
  ensureTexture(scene, 'hud-pause', 44, 44, (ctx) => {
    ellipse(ctx, 22, 22, 20, 20);
    ctx.fillStyle = 'rgba(13,18,14,0.7)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(201,150,63,0.8)';
    ctx.stroke();
    ctx.fillStyle = '#f4ead2';
    ctx.fillRect(15, 13, 5, 18);
    ctx.fillRect(24, 13, 5, 18);
  });
  ensureTexture(scene, 'hud-fireball', 28, 28, (ctx) => {
    const g = ctx.createRadialGradient(14, 14, 0, 14, 14, 14);
    g.addColorStop(0, '#fffdf0');
    g.addColorStop(0.45, '#ffb04a');
    g.addColorStop(1, 'rgba(226,98,43,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 28, 28);
  });
  ensureTexture(scene, 'hud-shrine', 26, 30, (ctx) => {
    ctx.fillStyle = '#c9963f';
    ctx.beginPath();
    ctx.moveTo(2, 9);
    ctx.lineTo(13, 2);
    ctx.lineTo(24, 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(5, 9, 3, 18);
    ctx.fillRect(18, 9, 3, 18);
    ctx.fillRect(2, 26, 22, 3);
    ctx.fillStyle = '#ff9a3c';
    ellipse(ctx, 13, 18, 3, 4);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(2, 26, 22, 3);
  });
  ensureTexture(scene, 'hud-warn', 40, 36, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(20, 2);
    ctx.lineTo(38, 34);
    ctx.lineTo(2, 34);
    ctx.closePath();
    ctx.fillStyle = '#f2b85a';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillRect(18, 11, 4, 13);
    ctx.fillRect(18, 27, 4, 4);
  });
  const palette = skinById(skin).palette;
  ensureTexture(scene, `hud-dragon-${skin}`, 30, 26, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(3, 16);
    ctx.quadraticCurveTo(6, 6, 16, 6);
    ctx.lineTo(27, 10);
    ctx.quadraticCurveTo(29, 15, 26, 17);
    ctx.lineTo(14, 21);
    ctx.quadraticCurveTo(6, 22, 3, 16);
    ctx.closePath();
    ctx.fillStyle = palette.body;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = palette.horn;
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(2, 2);
    ctx.lineTo(11, 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.eye;
    ellipse(ctx, 16, 11, 2, 1.6);
    ctx.fill();
  });
}
