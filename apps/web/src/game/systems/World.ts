import * as Phaser from 'phaser';
import {
  DT,
  groundAt,
  snarePhase,
  swingPose,
  type ChaseSimulation,
  type Collectible,
  type Course,
  type Obstacle,
} from '@dbfc/shared';
import { getRenderScale } from '../art/canvas';
import {
  boostPickupTexture,
  boulderTexture,
  branchTexture,
  bridgeTexture,
  crystalTexture,
  fireballTextures,
  logTexture,
  mudTexture,
  orbTexture,
  rockTexture,
  rootsTexture,
  scaleTexture,
  shieldPickupTexture,
  snareTextures,
  swingLogTexture,
  thornsTexture,
  trunkTexture,
  type PropTexture,
} from '../art/props';
import { DEPTH, PPM } from '../constants';

const OBS_BURNED = 3;
const OBS_SMASHED = 4;

interface ObstacleView {
  root: Phaser.GameObjects.Container;
  main: Phaser.GameObjects.Image;
  extra?: Phaser.GameObjects.Image;
  extra2?: Phaser.GameObjects.Image;
  shadow?: Phaser.GameObjects.Image;
  vines?: Phaser.GameObjects.Graphics;
  burned?: boolean;
  smashed?: boolean;
}

function propImage(
  scene: Phaser.Scene,
  tex: PropTexture,
  widthPx?: number,
): Phaser.GameObjects.Image {
  const s = getRenderScale();
  const img = scene.add.image(0, 0, tex.key);
  img.setOrigin(tex.ox, tex.oy);
  const sx = widthPx ? widthPx / tex.boxW : 1;
  img.setScale(sx / s, 1 / s);
  return img;
}

export class ObstacleLayer {
  private views = new Map<number, ObstacleView>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly course: Course,
  ) {}

  private create(o: Obstacle): ObstacleView {
    const scene = this.scene;
    const stage = this.course.stage;
    const v = o.variant % 4;
    const root = scene.add.container(o.x * PPM, -o.ground * PPM);
    const w = o.w * PPM;
    let view: ObstacleView;
    switch (o.kind) {
      case 'log':
        view = { root, main: propImage(scene, logTexture(scene, stage, v), w) };
        break;
      case 'rock':
        view = { root, main: propImage(scene, rockTexture(scene, stage, v), w) };
        break;
      case 'trunk':
        view = { root, main: propImage(scene, trunkTexture(scene, stage, v), w) };
        break;
      case 'branch':
        view = { root, main: propImage(scene, branchTexture(scene, stage, v), w) };
        break;
      case 'thorns':
        view = { root, main: propImage(scene, thornsTexture(scene, stage, v), w) };
        break;
      case 'roots':
        view = { root, main: propImage(scene, rootsTexture(scene, stage, v), w) };
        break;
      case 'mud':
        view = { root, main: propImage(scene, mudTexture(scene, stage), w) };
        root.setDepth(DEPTH.mud);
        break;
      case 'gap': {
        const left = propImage(scene, bridgeTexture(scene, stage, 'left'));
        const right = propImage(scene, bridgeTexture(scene, stage, 'right'));
        left.setOrigin(left.originX, left.originY);
        right.setPosition(w - 1.2 * PPM, 0);
        view = { root, main: left, extra: right };
        // Bridge remnants hang from the top edge of the ravine.
        left.setY(1.6 * PPM - 6);
        right.setY(1.6 * PPM - 6);
        break;
      }
      case 'boulder': {
        const tex = boulderTexture(scene, stage);
        const img = propImage(scene, tex);
        img.setOrigin(0.5, 0.5);
        img.setPosition(w / 2, -(o.y1 * PPM) / 2);
        view = { root, main: img };
        break;
      }
      case 'swing': {
        const tex = swingLogTexture(scene, stage);
        const img = propImage(scene, tex, w);
        const shadow = scene.add
          .image(w / 2, 2, 'fx-shadow')
          .setScale(((w / 64) * 1.2) / getRenderScale(), 1 / getRenderScale());
        const vines = scene.add.graphics();
        view = { root, main: img, shadow, vines };
        root.add(shadow);
        root.add(vines);
        break;
      }
      case 'snare': {
        const { ring, flame } = snareTextures(scene, stage);
        const ringImg = propImage(scene, ring, w);
        const flameImg = propImage(scene, flame, w);
        flameImg.setBlendMode(Phaser.BlendModes.ADD);
        const warn = scene.add
          .image(w / 2, -1.75 * PPM, 'hud-warn')
          .setScale(0.7 / getRenderScale());
        view = { root, main: ringImg, extra: flameImg, extra2: warn };
        break;
      }
    }
    root.add(view.main);
    if (view.extra) root.add(view.extra);
    if (view.extra2) root.add(view.extra2);
    if (root.depth === 0) root.setDepth(o.kind === 'branch' ? DEPTH.obstacle + 1 : DEPTH.obstacle);
    if (o.kind === 'gap') root.setDepth(DEPTH.terrain + 1);
    return view;
  }

  update(
    sim: ChaseSimulation,
    leftM: number,
    rightM: number,
    alpha: number,
    time: number,
    reducedMotion: boolean,
  ): void {
    const obs = this.course.obstacles;
    const tick = sim.tick - 1 + alpha;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i]!;
      const left = o.kind === 'boulder' ? Math.min(o.stopX, o.x) : o.x;
      const visible = o.x + o.w > leftM - 3 && left < rightM + 4;
      let view = this.views.get(i);
      if (!visible) {
        if (view) {
          view.root.destroy();
          this.views.delete(i);
        }
        if (left > rightM + 4) break;
        continue;
      }
      if (!view) {
        view = this.create(o);
        this.views.set(i, view);
      }
      const state = sim.obsState[i]!;
      switch (o.kind) {
        case 'thorns':
          if (state === OBS_BURNED && !view.burned) {
            view.burned = true;
            view.main.setTexture(
              thornsTexture(this.scene, this.course.stage, o.variant % 4, true).key,
            );
          }
          break;
        case 'boulder': {
          const active = sim.obsActive[i] === 1;
          let bx = sim.obsX[i]!;
          if (active && bx > o.stopX) bx = Math.min(o.x, bx + o.speed * DT * (1 - alpha));
          view.root.x = bx * PPM;
          const r = (o.y1 * PPM) / 2;
          view.main.setRotation(-((o.x - bx) * PPM) / r);
          break;
        }
        case 'swing': {
          const pose = swingPose(o, tick);
          const s0 = 1 / getRenderScale();
          const depthScale = 1 + 0.14 * pose.s;
          const yRel = (pose.bottom - o.ground) * PPM;
          view.main.setPosition((o.w * PPM * (1 - depthScale)) / 2, -yRel);
          view.main.setScale(((o.w * PPM) / (1.3 * PPM)) * s0 * depthScale, s0 * depthScale);
          view.main.setTint(pose.s < 0 ? 0xb8b8b0 : 0xffffff);
          if (view.shadow) view.shadow.setAlpha(0.35 + 0.4 * (1 - pose.s * pose.s));
          const g = view.vines!;
          g.clear();
          g.lineStyle(2.5, 0x6f8f55, 1);
          const top = -6 * PPM;
          for (const fx of [0.22, 0.78]) {
            const vx = o.w * PPM * fx;
            g.beginPath();
            g.moveTo(vx + pose.s * 6, top);
            g.lineTo(
              vx + (o.w * PPM * (1 - depthScale)) / 2 + (fx - 0.5) * o.w * PPM * (depthScale - 1),
              -yRel,
            );
            g.strokePath();
          }
          break;
        }
        case 'snare': {
          const phase = snarePhase(o, Math.floor(tick));
          const flame = view.extra!;
          const warn = view.extra2!;
          flame.setVisible(phase === 'active');
          if (phase === 'active')
            flame.setAlpha(reducedMotion ? 0.9 : 0.75 + 0.25 * Math.sin(time * 30));
          warn.setVisible(phase === 'warning');
          view.main.setTint(phase === 'dormant' ? 0x8a9a94 : 0xffffff);
          if (phase === 'warning' && !reducedMotion) warn.setAlpha(0.6 + 0.4 * Math.sin(time * 20));
          break;
        }
        default:
          break;
      }
      if (state === OBS_SMASHED && !view.smashed) {
        view.smashed = true;
        this.scene.tweens.add({ targets: view.root, alpha: 0, duration: 300 });
      }
    }
  }

  destroy(): void {
    for (const v of this.views.values()) v.root.destroy();
    this.views.clear();
  }
}

export class CollectibleLayer {
  private views = new Map<number, Phaser.GameObjects.Image>();
  private readonly keys: Record<Collectible['kind'], string>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly course: Course,
  ) {
    this.keys = {
      orb: orbTexture(scene),
      crystal: crystalTexture(scene),
      shield: shieldPickupTexture(scene),
      boost: boostPickupTexture(scene),
      scale: scaleTexture(scene),
    };
  }

  update(
    sim: ChaseSimulation,
    leftM: number,
    rightM: number,
    time: number,
    reducedMotion: boolean,
  ): void {
    const cols = this.course.collectibles;
    const s0 = 1 / getRenderScale();
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i]!;
      const visible = c.x > leftM - 1 && c.x < rightM + 2 && !sim.colTaken[i];
      let img = this.views.get(i);
      if (!visible) {
        if (img) {
          img.destroy();
          this.views.delete(i);
        }
        if (c.x > rightM + 2) break;
        continue;
      }
      if (!img) {
        img = this.scene.add.image(c.x * PPM, -c.y * PPM, this.keys[c.kind]);
        img.setDepth(DEPTH.collectible);
        img.setScale(s0 * (c.kind === 'orb' ? 0.9 : 1));
        if (c.kind === 'orb') img.setBlendMode(Phaser.BlendModes.SCREEN);
        this.views.set(i, img);
      }
      if (!reducedMotion) {
        const bob = Math.sin(time * 3 + c.x) * (c.kind === 'orb' ? 2 : 3.5);
        img.setY(-c.y * PPM + bob);
        if (c.kind === 'scale' || c.kind === 'crystal')
          img.setRotation(Math.sin(time * 2 + i) * 0.12);
      }
    }
  }

  destroy(): void {
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
  }
}

/** Map the true gap to an on-screen distance so the fireball stays visible. */
export function displayGap(gap: number): number {
  if (gap <= 10) return Math.max(0, gap);
  return 10 + 7 * (1 - Math.exp(-(gap - 10) / 25));
}

export class FireballView {
  readonly root: Phaser.GameObjects.Container;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly core: Phaser.GameObjects.Image;
  private readonly tongues: Phaser.GameObjects.Image[] = [];
  readonly trail: Phaser.GameObjects.Particles.ParticleEmitter;
  private hover = 3;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly course: Course,
  ) {
    const t = fireballTextures(scene);
    const s0 = 1 / getRenderScale();
    this.root = scene.add.container(0, 0).setDepth(DEPTH.fireball);
    this.glow = scene.add
      .image(0, 0, t.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(s0 * 1.2);
    for (let i = 0; i < 4; i++) {
      const tongue = scene.add
        .image(0, 0, t.tongue)
        .setOrigin(0.92, 0.5)
        .setBlendMode(Phaser.BlendModes.ADD);
      tongue.setScale(s0 * 0.7);
      this.tongues.push(tongue);
    }
    this.core = scene.add
      .image(0, 0, t.core)
      .setScale(s0 * 0.85)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.root.add([this.glow, ...this.tongues, this.core]);
    this.trail = scene.add.particles(0, 0, 'p-dot', {
      lifespan: { min: 300, max: 700 },
      speedX: { min: 10, max: 60 },
      speedY: { min: -30, max: 30 },
      scale: { start: (0.9 / getRenderScale()) * 1.6, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffd27a, 0xff9a3c, 0xe2622b],
      blendMode: Phaser.BlendModes.ADD,
      frequency: 28,
    });
    this.trail.setDepth(DEPTH.fireball - 1);
  }

  update(
    dragonX: number,
    gap: number,
    time: number,
    cornered: boolean,
    reducedMotion: boolean,
  ): void {
    const x = dragonX + displayGap(gap);
    const keys = this.course.hover;
    const secs = Math.max(0, time);
    const i = Math.floor(secs) % keys.length;
    const f = secs - Math.floor(secs);
    const a = keys[i] ?? 3;
    const b = keys[(i + 1) % keys.length] ?? 3;
    const target = a + (b - a) * (f * f * (3 - 2 * f));
    this.hover += (target - this.hover) * 0.08;
    const ground = groundAt(this.course, x);
    const bob = reducedMotion ? 0 : Math.sin(time * 4.2) * 0.12;
    const px = x * PPM;
    const py = -(ground + this.hover + bob) * PPM;
    this.root.setPosition(px, py);
    this.trail.setPosition(px + 6, py);
    const flare = cornered ? 1.25 : 1;
    this.glow.setScale(
      (1 / getRenderScale()) * (1.15 + (reducedMotion ? 0 : 0.08 * Math.sin(time * 9))) * flare,
    );
    const s0 = 1 / getRenderScale();
    this.tongues.forEach((t, k) => {
      const phase = time * (5.5 + k * 1.3) + k * 1.9;
      const flicker = reducedMotion ? 0 : Math.sin(phase);
      t.setRotation((k - 1.5) * 0.28 + flicker * 0.12);
      t.setScale(
        s0 * (0.62 + 0.12 * k * 0.5 + (reducedMotion ? 0 : 0.1 * Math.sin(phase * 1.7))),
        s0 * (0.7 - k * 0.06),
      );
      t.setPosition(10, (k - 1.5) * 3);
    });
    this.core.setScale(s0 * (0.85 + (reducedMotion ? 0 : 0.05 * Math.sin(time * 11))) * flare);
  }

  destroy(): void {
    this.trail.destroy();
    this.root.destroy();
  }
}
