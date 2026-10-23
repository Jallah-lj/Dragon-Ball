import * as Phaser from 'phaser';
import type { ParticleStyle } from '../art/biomes';
import { getRenderScale } from '../art/canvas';
import { DEPTH } from '../constants';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

/** Particle effects and floating score text. */
export class Fx {
  private readonly s0: number;
  private dust: Emitter;
  private burst: Emitter;
  private sparks: Emitter;
  private leaves: Emitter;
  private flame: Emitter;
  private splash: Emitter;
  private ring: Emitter;
  private ambient: Emitter;
  private texts: Phaser.GameObjects.Text[] = [];
  private density: number;

  constructor(
    private readonly scene: Phaser.Scene,
    ambientStyle: ParticleStyle,
    lowGraphics: boolean,
    private readonly reducedMotion: boolean,
  ) {
    this.s0 = 1 / getRenderScale();
    this.density = lowGraphics ? 0.4 : 1;
    const s = this.s0;
    const base = { emitting: false, blendMode: Phaser.BlendModes.NORMAL } as const;
    this.dust = scene.add.particles(0, 0, 'p-puff', {
      ...base,
      lifespan: 420,
      speedX: { min: -80, max: -20 },
      speedY: { min: -40, max: -5 },
      scale: { start: 0.6 * s * 1.6, end: 1.1 * s * 1.6 },
      alpha: { start: 0.45, end: 0 },
      tint: 0xb39a78,
    });
    this.burst = scene.add.particles(0, 0, 'p-dot', {
      ...base,
      lifespan: { min: 250, max: 520 },
      speed: { min: 60, max: 220 },
      scale: { start: 0.9 * s * 1.6, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
    });
    this.sparks = scene.add.particles(0, 0, 'p-spark', {
      ...base,
      lifespan: { min: 200, max: 450 },
      speed: { min: 120, max: 320 },
      rotate: { min: 0, max: 360 },
      scale: { start: s * 1.4, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      gravityY: 300,
    });
    this.leaves = scene.add.particles(0, 0, 'p-leaf', {
      ...base,
      lifespan: { min: 600, max: 1100 },
      speed: { min: 60, max: 180 },
      angle: { min: 180, max: 360 },
      rotate: { start: 0, end: 360 },
      scale: { start: s * 1.5, end: s * 0.6 },
      alpha: { start: 1, end: 0 },
      gravityY: 160,
    });
    this.flame = scene.add.particles(0, 0, 'p-dot', {
      ...base,
      lifespan: { min: 160, max: 320 },
      speedX: { min: -280, max: -140 },
      speedY: { min: -50, max: 50 },
      scale: { start: 1.1 * s * 1.6, end: 0.15 * s },
      alpha: { start: 0.55, end: 0 },
      tint: [0xffb04a, 0xef7a3e, 0xe2622b, 0xffd27a],
      blendMode: Phaser.BlendModes.ADD,
      frequency: 22,
    });
    this.splash = scene.add.particles(0, 0, 'p-dot', {
      ...base,
      lifespan: 500,
      speed: { min: 60, max: 160 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.5 * s * 1.6, end: 0.2 * s },
      tint: 0x4a3626,
      gravityY: 600,
    });
    this.ring = scene.add.particles(0, 0, 'p-ring', {
      ...base,
      lifespan: 450,
      scale: { start: 0.2 * s * 1.6, end: 1.6 * s * 1.6 },
      alpha: { start: 0.9, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
    });
    const ambientCfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig =
      ambientStyle === 'fireflies'
        ? {
            lifespan: { min: 3000, max: 6000 },
            speedX: { min: -25, max: 15 },
            speedY: { min: -20, max: 20 },
            scale: { start: 0.55 * s * 1.6, end: 0.2 * s * 1.6 },
            alpha: { values: [0, 1, 0.3, 1, 0] },
            tint: [0xf5d76e, 0xfff0a0, 0x9be3c8],
            blendMode: Phaser.BlendModes.ADD,
            frequency: 140 / this.density,
          }
        : ambientStyle === 'mist'
          ? {
              lifespan: { min: 4000, max: 7000 },
              speedX: { min: -30, max: -5 },
              speedY: { min: -6, max: 6 },
              scale: { start: 3 * s * 1.6, end: 5 * s * 1.6 },
              alpha: { values: [0, 0.14, 0] },
              tint: 0xe8eee8,
              frequency: 220 / this.density,
            }
          : {
              lifespan: { min: 3000, max: 6000 },
              speedX: { min: -40, max: -10 },
              speedY: { min: -10, max: 14 },
              scale: { start: 0.35 * s * 1.6, end: 0.2 * s * 1.6 },
              alpha: { values: [0, 0.8, 0] },
              tint: [0xfff1c2, 0xf2c14e],
              blendMode: Phaser.BlendModes.ADD,
              frequency: 160 / this.density,
            };
    this.ambient = scene.add.particles(0, 0, 'p-dot', {
      ...ambientCfg,
      emitting: !reducedMotion,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, 0, 1500, 720), quantity: 1 },
    });
    for (const e of [this.dust, this.splash, this.leaves]) e.setDepth(DEPTH.particles - 5);
    for (const e of [this.burst, this.sparks, this.ring, this.flame]) e.setDepth(DEPTH.particles);
    this.ambient.setDepth(DEPTH.fog - 1);
  }

  /** Move the ambient spawn area (top-left of the camera view). */
  setAmbientOrigin(x: number, y: number): void {
    this.ambient.setPosition(x, y);
  }

  count(n: number): number {
    return Math.max(1, Math.round(n * this.density * (this.reducedMotion ? 0.4 : 1)));
  }

  dustAt(x: number, y: number, n = 3): void {
    this.dust.explode(this.count(n), x, y);
  }

  burstAt(x: number, y: number, tint: number | number[], n = 10): void {
    this.burst.setParticleTint(Array.isArray(tint) ? tint[0]! : tint);
    this.burst.explode(this.count(n), x, y);
  }

  sparksAt(x: number, y: number, tint: number, n = 8): void {
    this.sparks.setParticleTint(tint);
    this.sparks.explode(this.count(n), x, y);
  }

  leavesAt(x: number, y: number, tint: number, n = 8): void {
    this.leaves.setParticleTint(tint);
    this.leaves.explode(this.count(n), x, y);
  }

  splashAt(x: number, y: number, n = 8): void {
    this.splash.explode(this.count(n), x, y);
  }

  ringAt(x: number, y: number, tint: number): void {
    this.ring.setParticleTint(tint);
    this.ring.explode(1, x, y);
  }

  setFlame(on: boolean, x: number, y: number): void {
    this.flame.setPosition(x, y);
    if (on && !this.flame.emitting) this.flame.start();
    if (!on && this.flame.emitting) this.flame.stop();
  }

  floatText(x: number, y: number, text: string, color = '#ffe7a3', size = 18): void {
    let t = this.texts.find((tt) => !tt.active);
    if (!t) {
      t = this.scene.add.text(0, 0, '', {
        fontFamily: '"Alegreya Sans", sans-serif',
        fontStyle: '800',
        fontSize: `${size}px`,
        stroke: '#1a120c',
        strokeThickness: 4,
        resolution: getRenderScale(),
      });
      t.setOrigin(0.5, 1).setDepth(DEPTH.particles + 2);
      this.texts.push(t);
    }
    t.setActive(true)
      .setVisible(true)
      .setAlpha(1)
      .setPosition(x, y)
      .setText(text)
      .setColor(color)
      .setFontSize(size);
    this.scene.tweens.add({
      targets: t,
      y: y - (this.reducedMotion ? 0 : 38),
      alpha: 0,
      duration: 800,
      ease: 'Cubic.easeOut',
      onComplete: () => t.setActive(false).setVisible(false),
    });
  }

  destroy(): void {
    for (const e of [
      this.dust,
      this.burst,
      this.sparks,
      this.leaves,
      this.flame,
      this.splash,
      this.ring,
      this.ambient,
    ])
      e.destroy();
    for (const t of this.texts) t.destroy();
  }
}
