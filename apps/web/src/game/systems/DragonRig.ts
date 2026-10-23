import * as Phaser from 'phaser';
import { getRenderScale } from '../art/canvas';
import { dragonParts, type DragonParts, type PartSpec } from '../art/dragon';

export interface RigInput {
  /** Horizontal speed (m/s). */
  speed: number;
  grounded: boolean;
  vy: number;
  sliding: boolean;
  dashing: boolean;
  stumbling: boolean;
  inMud: boolean;
  rescue: boolean;
}

const RIG_SCALE = 0.9;

/** Joint offsets relative to the body pivot (logical px, unrotated). */
const J = {
  hip: [-20, 9],
  shoulder: [17, 9],
  neck: [30, -6],
  wing: [4, -12],
  tail: [-36, -2],
} as const;

function rotate(x: number, y: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

/**
 * Procedurally animated dragon made of individual part images. Pose blends
 * (run / air / slide / dash) are smoothed over time for fluid transitions.
 */
export class DragonRig {
  readonly container: Phaser.GameObjects.Container;
  private parts!: DragonParts;
  private img: Record<string, Phaser.GameObjects.Image> = {};
  private tailImgs: Phaser.GameObjects.Image[] = [];
  private phase = 0;
  private airBlend = 0;
  private slideBlend = 0;
  private dashBlend = 0;
  private flapT = 1;
  private flapStrength = 1;
  private hurtT = 1;
  private landT = 1;
  private time = 0;
  private skin: string;

  constructor(
    private readonly scene: Phaser.Scene,
    skin: string,
  ) {
    this.skin = skin;
    this.container = scene.add.container(0, 0);
    this.container.setScale(RIG_SCALE);
    this.build();
  }

  private makeImage(spec: PartSpec): Phaser.GameObjects.Image {
    const s = getRenderScale();
    const im = this.scene.add.image(0, 0, spec.key);
    im.setOrigin(spec.px / spec.w, spec.py / spec.h);
    im.setScale(1 / s);
    return im;
  }

  private build(): void {
    this.container.removeAll(true);
    this.parts = dragonParts(this.scene, this.skin);
    const p = this.parts;
    const order: [string, PartSpec][] = [
      ['wingFar', p.wingFar],
      ['legBackFar', p.legBackFar],
      ['legFrontFar', p.legFrontFar],
    ];
    for (const [name, spec] of order) this.img[name] = this.makeImage(spec);
    this.container.add([this.img.wingFar!, this.img.legBackFar!, this.img.legFrontFar!]);
    this.tailImgs = [...p.tail, p.tailTip].map((spec) => this.makeImage(spec));
    for (let i = this.tailImgs.length - 1; i >= 0; i--) this.container.add(this.tailImgs[i]!);
    for (const [name, spec] of [
      ['body', p.body],
      ['neck', p.neck],
      ['head', p.head],
      ['legBackNear', p.legBackNear],
      ['legFrontNear', p.legFrontNear],
      ['wingNear', p.wingNear],
    ] as [string, PartSpec][]) {
      this.img[name] = this.makeImage(spec);
      this.container.add(this.img[name]!);
    }
  }

  setSkin(skin: string): void {
    if (skin === this.skin) return;
    this.skin = skin;
    this.build();
  }

  /** Trigger a wing beat (jump = 1, Forest Leap = 1.6). */
  flap(strength = 1): void {
    this.flapT = 0;
    this.flapStrength = strength;
  }

  hurt(): void {
    this.hurtT = 0;
  }

  land(): void {
    this.landT = 0;
  }

  setTint(color: number | null): void {
    for (const im of [...Object.values(this.img), ...this.tailImgs]) {
      if (color === null) im.clearTint();
      else im.setTintFill(color);
    }
  }

  setAlpha(a: number): void {
    this.container.setAlpha(a);
  }

  update(dt: number, s: RigInput, reducedMotion: boolean): void {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 14);
    const air = s.grounded && !s.rescue ? 0 : 1;
    this.airBlend += (air - this.airBlend) * k;
    this.slideBlend += ((s.sliding ? 1 : 0) - this.slideBlend) * (1 - Math.exp(-dt * 22));
    this.dashBlend += ((s.dashing ? 1 : 0) - this.dashBlend) * k;
    const stride = s.inMud ? 1.1 : 1.7;
    if (s.grounded)
      this.phase += (s.speed / stride) * Math.PI * 2 * dt * (this.slideBlend > 0.5 ? 0.25 : 1);
    this.flapT = Math.min(1, this.flapT + dt / 0.38);
    this.hurtT = Math.min(1, this.hurtT + dt / 0.45);
    this.landT = Math.min(1, this.landT + dt / 0.18);
    if (s.rescue && this.flapT >= 1) this.flap(1.2);

    const A = this.airBlend;
    const S = this.slideBlend;
    const D = this.dashBlend;
    const R = 1 - A;
    const ph = this.phase;

    // Body
    const bob = reducedMotion ? 0 : -2.5 * Math.abs(Math.sin(ph)) * R * (1 - S);
    let bodyRot = 0.03 * Math.sin(ph * 2) * R * (1 - S);
    bodyRot += Phaser.Math.Clamp(-s.vy * 0.018, -0.3, 0.35) * A;
    bodyRot += -0.08 * D * R + 0.04 * S;
    if (s.stumbling) bodyRot += 0.22;
    if (this.hurtT < 1 && !reducedMotion)
      bodyRot += Math.sin(this.hurtT * 40) * 0.22 * (1 - this.hurtT);
    const bodyY = -36 + bob + S * 15 + (this.landT < 1 ? 3 * (1 - this.landT) : 0);
    const body = this.img.body!;
    body.setPosition(0, bodyY);
    body.setRotation(bodyRot);
    const squash = this.landT < 1 ? 1 - 0.08 * (1 - this.landT) : 1;
    const s0 = 1 / getRenderScale();
    body.setScale(s0 * (2 - squash), s0 * squash);

    const at = (j: readonly [number, number]): [number, number] => {
      const [x, y] = rotate(j[0], j[1], bodyRot);
      return [x, bodyY + y];
    };

    // Legs (diagonal gait while running, tucked in the air, stretched while sliding)
    const swing = s.inMud ? 0.45 : 0.68;
    const legs: [string, readonly [number, number], number, number, number][] = [
      ['legBackNear', J.hip, swing * Math.sin(ph), -0.55, 1.25],
      ['legBackFar', J.hip, swing * Math.sin(ph + Math.PI), -0.35, 1.15],
      ['legFrontNear', J.shoulder, 0.58 * Math.sin(ph + Math.PI + 0.4), -0.95, -1.15],
      ['legFrontFar', J.shoulder, 0.58 * Math.sin(ph + 0.4), -0.7, -1.05],
    ];
    for (const [name, joint, run, airPose, slidePose] of legs) {
      const [x, y] = at(joint);
      const im = this.img[name]!;
      im.setPosition(x + (name.includes('Far') ? 3 : 0), y);
      const base = run * R * (1 - S) + airPose * A + slidePose * S * R;
      im.setRotation(base + bodyRot);
    }

    // Wings
    let wingRot = 0.38 + (reducedMotion ? 0 : 0.05 * Math.sin(ph * 2)) * R;
    let wingSY = 0.85;
    wingRot = wingRot * (1 - A) + A * (s.vy > 0 ? -0.55 : -0.05);
    wingSY = wingSY * (1 - A) + A * 1;
    wingRot += D * 0.35 + S * 0.25;
    wingSY *= 1 - 0.35 * D - 0.3 * S;
    if (this.flapT < 1) {
      const f = this.flapT;
      const beat = Math.sin(f * Math.PI * 2);
      wingSY = Phaser.Math.Linear(
        wingSY,
        beat > 0 ? 1 : -0.35,
        Math.abs(beat) * this.flapStrength * 0.9,
      );
      wingRot -= 0.35 * Math.sin(f * Math.PI) * this.flapStrength;
    }
    const [wx, wy] = at(J.wing);
    for (const [name, off, dark] of [
      ['wingNear', 0, 0],
      ['wingFar', -4, 1],
    ] as const) {
      const im = this.img[name]!;
      im.setPosition(wx + off, wy - dark * 3);
      im.setRotation(wingRot + bodyRot - dark * 0.12);
      im.setScale(s0, s0 * wingSY * (dark ? 0.92 : 1));
    }

    // Neck & head
    const [nx, ny] = at(J.neck);
    const neckRot =
      0.62 +
      S * 0.55 +
      D * 0.15 +
      bodyRot -
      A * 0.1 +
      (reducedMotion ? 0 : 0.04 * Math.sin(ph * 2 + 1)) * R;
    const neck = this.img.neck!;
    neck.setPosition(nx, ny);
    neck.setRotation(neckRot);
    const [hx, hy] = rotate(24, -22, neckRot);
    const head = this.img.head!;
    head.setPosition(nx + hx, ny + hy);
    head.setRotation(-0.35 + neckRot * 0.55 + S * 0.15 - A * 0.05);

    // Tail chain
    let [tx, ty] = at(J.tail);
    // Screen y points down, so angles slightly above PI point up-and-back.
    let angle = Math.PI + bodyRot + 0.32 * R * (1 - S) + 0.08 * S - A * 0.2 * Math.sign(s.vy || 1);
    const segLens = [...this.parts.tail.map((t) => t.w - 4), this.parts.tailTip.w];
    for (let i = 0; i < this.tailImgs.length; i++) {
      const sway = reducedMotion
        ? 0
        : (0.13 * Math.sin(ph - i * 0.75) * R + 0.05 * Math.sin(this.time * 3 - i)) *
          (1 - D) *
          (1 - S);
      const curve = (i === 0 ? 0.0 : -0.13 + A * 0.05) * (1 - D) * (1 - S);
      angle += curve + sway;
      const im = this.tailImgs[i]!;
      im.setPosition(tx, ty);
      im.setRotation(angle - Math.PI);
      const len = segLens[i]! * 0.92;
      tx += Math.cos(angle) * len;
      ty += Math.sin(angle) * len;
    }
  }
}
