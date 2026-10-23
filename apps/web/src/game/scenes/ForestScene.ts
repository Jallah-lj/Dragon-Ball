import * as Phaser from 'phaser';
import { CATCH_DISTANCE, DT, FIREBALL, groundAt, RACE_FLAG, type SimEvent } from '@dbfc/shared';
import { BIOMES } from '../art/biomes';
import { getRenderScale } from '../art/canvas';
import { toInt } from '../art/color';
import {
  brushTexture,
  farTreesTexture,
  fogTexture,
  hillsTexture,
  midTreesTexture,
  nearTreesTexture,
  rayTexture,
  skyTexture,
  sunTexture,
  vignetteTexture,
} from '../art/forest';
import { particleTextures } from '../art/props';
import { DEPTH, DRAGON_SCREEN_X, GROUND_SCREEN_Y, PPM, VIEW_H, VIEW_W } from '../constants';
import type { GameSession } from '../session/GameSession';
import { AudioManager } from '../systems/AudioManager';
import { DragonRig } from '../systems/DragonRig';
import { Fx } from '../systems/Fx';
import { InputController } from '../systems/Input';
import { TerrainRenderer } from '../systems/Terrain';
import { CollectibleLayer, FireballView, ObstacleLayer } from '../systems/World';
import { prefersReducedMotion, settingsStore } from '../../lib/settings';

interface Layer {
  sprite: Phaser.GameObjects.TileSprite;
  factor: number;
  /** Screen y of the layer's bottom edge (logical px). */
  bottom: number;
  height: number;
  drift?: number;
}

interface GhostView {
  rig: DragonRig;
  label: Phaser.GameObjects.Text;
}

/** Renders the deterministic chase simulation as a living forest. */
export class ForestScene extends Phaser.Scene {
  session!: GameSession;
  private input2!: InputController;
  private terrain!: TerrainRenderer;
  private obstacles!: ObstacleLayer;
  private collectibles!: CollectibleLayer;
  private fireball!: FireballView;
  private rig!: DragonRig;
  private fx!: Fx;
  private audio = AudioManager.get();
  private layers: Layer[] = [];
  private sky!: Phaser.GameObjects.Image;
  private skyLate!: Phaser.GameObjects.Image;
  private sun!: Phaser.GameObjects.Image;
  private rays: Phaser.GameObjects.Image[] = [];
  private vignette!: Phaser.GameObjects.Image;
  private lateTint!: Phaser.GameObjects.Rectangle;
  private shadow!: Phaser.GameObjects.Image;
  private shield!: Phaser.GameObjects.Image;
  private flash!: Phaser.GameObjects.Rectangle;
  private ghosts = new Map<string, GhostView>();
  private camGround = 0;
  private camZoomMul = 1;
  private elapsed = 0;
  private reducedMotion = false;
  private unsub: (() => void)[] = [];
  private lastRenderX = 0;
  private lastHitFlash = -1;

  constructor() {
    super('forest');
  }

  create(): void {
    this.session = this.registry.get('session') as GameSession;
    const session = this.session;
    const course = session.sim.course;
    const stage = course.stage;
    const b = BIOMES[stage];
    const settings = settingsStore.get();
    this.reducedMotion = prefersReducedMotion(settings);
    const S = getRenderScale();
    this.layers = [];
    this.rays = [];
    this.ghosts.clear();
    this.elapsed = 0;

    this.cameras.main.setZoom(S);
    this.cameras.main.setBackgroundColor(b.sky[0]);
    particleTextures(this);

    // Sky, sun and light rays.
    const skyA = skyTexture(this, stage, false);
    const skyB = skyTexture(this, stage, true);
    this.sky = this.add.image(0, 0, skyA.key).setOrigin(0, 0).setDepth(DEPTH.sky);
    this.skyLate = this.add.image(0, 0, skyB.key).setOrigin(0, 0).setDepth(DEPTH.sky).setAlpha(0);
    for (const im of [this.sky, this.skyLate]) im.setDisplaySize(VIEW_W + 8, VIEW_H + 8);
    const sun = sunTexture(this, stage);
    this.sun = this.add.image(0, 0, sun.key).setDepth(DEPTH.rays + 1);
    const ray = rayTexture(this);
    for (let i = 0; i < 4; i++) {
      const r = this.add.image(0, 0, ray).setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD);
      r.setDepth(DEPTH.rays).setTint(toInt(b.ray));
      r.setScale((1.6 + i * 0.5) / S, 1.15 / S);
      this.rays.push(r);
    }

    // Parallax forest.
    const addLayer = (
      spec: { key: string; width: number; height: number },
      factor: number,
      bottom: number,
      depth: number,
      alpha = 1,
      drift = 0,
    ) => {
      // Skip the outermost texture rows so vertical wrap-around filtering never shows a seam.
      const ts = this.add
        .tileSprite(0, 0, VIEW_W + 16, spec.height - 2, spec.key)
        .setOrigin(0, 0)
        .setDepth(depth)
        .setAlpha(alpha);
      ts.tilePositionY = 1;
      this.layers.push({ sprite: ts, factor, bottom, height: spec.height, drift });
    };
    addLayer(hillsTexture(this, stage), 0.05, VIEW_H * 0.6, DEPTH.far - 1);
    addLayer(farTreesTexture(this, stage), 0.14, VIEW_H * 0.69, DEPTH.far);
    addLayer(fogTexture(this, stage), 0.2, VIEW_H * 0.72, DEPTH.farFog, b.fogAlpha * 2.2, 6);
    addLayer(midTreesTexture(this, stage), 0.3, VIEW_H * 0.78, DEPTH.mid);
    addLayer(fogTexture(this, stage), 0.42, VIEW_H * 0.8, DEPTH.midFog, b.fogAlpha * 1.6, 10);
    addLayer(nearTreesTexture(this, stage), 0.55, VIEW_H * 0.84, DEPTH.near);
    addLayer(brushTexture(this, stage), 0.82, VIEW_H * 0.81, DEPTH.backBrush);
    addLayer(fogTexture(this, stage), 1.1, VIEW_H * 0.98, DEPTH.fog, b.fogAlpha * 0.9, 14);

    // World.
    this.terrain = new TerrainRenderer(this, course);
    this.obstacles = new ObstacleLayer(this, course);
    this.collectibles = new CollectibleLayer(this, course);
    this.fireball = new FireballView(this, course);
    this.shadow = this.add.image(0, 0, 'fx-shadow').setDepth(DEPTH.dragon - 1);
    this.rig = new DragonRig(this, session.skin);
    this.rig.container.setDepth(DEPTH.dragon);
    this.shield = this.add
      .image(0, 0, 'fx-shield')
      .setDepth(DEPTH.dragon + 1)
      .setVisible(false);
    this.shield.setScale(1 / S);
    this.fx = new Fx(this, b.particle, settings.graphics === 'low', this.reducedMotion);

    // Overlays.
    this.lateTint = this.add
      .rectangle(0, 0, VIEW_W + 16, VIEW_H + 16, toInt(b.lateTint), 0)
      .setOrigin(0, 0)
      .setDepth(DEPTH.vignette - 1);
    this.vignette = this.add
      .image(0, 0, vignetteTexture(this))
      .setOrigin(0, 0)
      .setDepth(DEPTH.vignette);
    this.vignette.setDisplaySize(VIEW_W + 16, VIEW_H + 16);
    this.flash = this.add
      .rectangle(0, 0, VIEW_W + 16, VIEW_H + 16, 0xffffff, 0)
      .setOrigin(0, 0)
      .setDepth(DEPTH.vignette + 1);

    // Input & events.
    if (session.mode !== 'attract') {
      this.input2 = new InputController(session);
    }
    this.unsub.push(session.on('sim', (events) => this.onSimEvents(events)));
    this.unsub.push(
      session.on('finish', (result) => {
        if (session.mode === 'attract') return;
        this.audio.play(
          result.outcome === 'caught'
            ? 'catch'
            : result.outcome === 'escaped'
              ? 'escape'
              : 'defeat',
        );
        if (result.outcome === 'caught') {
          this.flashScreen(0xfff1c2, 0.6);
          const fb = this.fireball.root;
          this.fx.burstAt(fb.x, fb.y, 0xffd27a, 40);
          this.fx.ringAt(fb.x, fb.y, 0xffd27a);
        }
      }),
    );
    if (session.mode !== 'attract') {
      this.audio.startMusic(stage);
    }

    this.camGround = groundAt(course, session.sim.x);
    this.lastRenderX = session.sim.x;
    // The HUD runs as a parallel scene on top of the forest.
    this.scene.launch('hud');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
    this.positionWorld(0);
  }

  private cleanup(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.input2?.destroy();
    this.terrain?.destroy();
    this.obstacles?.destroy();
    this.collectibles?.destroy();
    this.fireball?.destroy();
    this.fx?.destroy();
    for (const g of this.ghosts.values()) {
      g.rig.container.destroy();
      g.label.destroy();
    }
    this.ghosts.clear();
    this.audio.stopMusic();
  }

  private flashScreen(color: number, alpha: number): void {
    if (this.reducedMotion) alpha *= 0.4;
    this.flash.setFillStyle(color, alpha);
    this.tweens.add({ targets: this.flash, fillAlpha: 0, duration: 380 });
  }

  private onSimEvents(events: readonly SimEvent[]): void {
    const a = this.audio;
    const sim = this.session.sim;
    const footX = sim.x * PPM;
    const footY = -sim.y * PPM;
    const shake = settingsStore.get().screenShake && !this.reducedMotion;
    for (const e of events) {
      const ex = e.x * PPM;
      const ey = -e.y * PPM;
      switch (e.type) {
        case 'jump':
          this.rig.flap(1);
          this.fx.dustAt(footX, footY, 4);
          a.play('jump');
          break;
        case 'leap':
          this.rig.flap(1.7);
          this.fx.leavesAt(footX, footY - 30, toInt(BIOMES[sim.course.stage].grassLight), 10);
          a.play('leap');
          break;
        case 'land':
          this.rig.land();
          this.fx.dustAt(footX, footY, 5);
          a.play('land');
          break;
        case 'slide':
          this.fx.dustAt(footX, footY, 6);
          a.play('slide');
          break;
        case 'hit':
        case 'pitFall':
          this.rig.hurt();
          this.lastHitFlash = this.elapsed;
          if (shake) this.cameras.main.shake(200, 0.008);
          this.fx.sparksAt(footX + 20, footY - 30, 0xff7a3a, 12);
          this.fx.leavesAt(footX + 20, footY - 20, toInt(BIOMES[sim.course.stage].moss), 8);
          this.fx.floatText(footX, footY - 70, '−1 heart', '#ffb4a6', 20);
          a.play('hit');
          break;
        case 'shieldBlock':
          this.fx.ringAt(footX, footY - 30, 0xd9b45a);
          this.fx.sparksAt(footX + 30, footY - 30, 0xe8d28c, 14);
          this.fx.floatText(footX, footY - 70, 'Blocked!', '#e8d28c', 20);
          a.play('shieldBlock');
          break;
        case 'stumble':
          this.fx.leavesAt(footX + 10, footY - 6, toInt(BIOMES[sim.course.stage].trunk), 6);
          a.play('stumble');
          break;
        case 'mud':
          this.fx.splashAt(footX, footY, 12);
          a.play('mud');
          break;
        case 'collect': {
          const colors: Record<string, [number, string, string]> = {
            orb: [0xffc35c, '+10', 'orb'],
            crystal: [0x8ff0c8, '+25', 'crystal'],
            scale: [0xffd36b, '+250 Ancient Scale!', 'scale'],
            shield: [0xa9c27a, 'Shield!', 'pickup'],
            boost: [0xef7a3e, 'Tailwind!', 'pickup'],
          };
          const [tint, label, sfx] = colors[e.kind] ?? [0xffffff, '', 'orb'];
          this.fx.burstAt(ex, ey, tint, e.kind === 'orb' ? 6 : 16);
          if (e.kind !== 'orb')
            this.fx.floatText(ex, ey - 16, label, '#fff1c2', e.kind === 'scale' ? 22 : 18);
          a.play(sfx as 'orb');
          break;
        }
        case 'clear':
          a.play('clear');
          break;
        case 'burn':
          this.fx.burstAt(ex, ey - 16, [0xffb04a], 26);
          this.fx.sparksAt(ex, ey - 16, 0xff9a3c, 16);
          this.fx.floatText(ex, ey - 50, '+30 Burned!', '#ffc58a', 18);
          a.play('burn');
          break;
        case 'dash':
          a.play('dash');
          if (shake) this.cameras.main.shake(120, 0.003);
          break;
        case 'shieldUp':
          a.play('shieldUp');
          break;
        case 'boulderRoll':
          a.play('boulder');
          if (shake) this.cameras.main.shake(300, 0.002);
          break;
        case 'flowMax':
          this.fx.floatText(footX, footY - 90, 'FLOW MAX', '#ffd36b', 24);
          this.fx.ringAt(footX, footY - 30, 0xffd36b);
          break;
        default:
          break;
      }
    }
  }

  override update(_time: number, delta: number): void {
    const session = this.session;
    if (!session) return;
    this.input2?.pollGamepads();
    session.frame(delta);
    const dt = Math.min(0.05, delta / 1000);
    if (!session.paused || session.pauseReason === 'tutorial') this.elapsed += dt;
    this.positionWorld(dt);
  }

  private positionWorld(dt: number): void {
    const session = this.session;
    const sim = session.sim;
    const course = sim.course;
    const alpha = session.alpha;
    const x = sim.prevX + (sim.x - sim.prevX) * alpha;
    const y = sim.prevY + (sim.y - sim.prevY) * alpha;
    const gap = sim.prevFbX + (sim.fbX - sim.prevFbX) * alpha - x;
    const S = getRenderScale();

    // Camera follows the ground (and lifts a little for high jumps).
    const ground = groundAt(course, x);
    const target = Math.max(ground, y - 1.4);
    this.camGround += (target - this.camGround) * (1 - Math.exp(-dt * 5));
    const dashing = sim.dashTicks > 0;
    this.camZoomMul +=
      ((dashing && !this.reducedMotion ? 0.95 : 1) - this.camZoomMul) * (1 - Math.exp(-dt * 4));
    const cam = this.cameras.main;
    cam.setZoom(S * this.camZoomMul);
    const viewW = VIEW_W / this.camZoomMul;
    const viewH = VIEW_H / this.camZoomMul;
    const dragonPx = x * PPM;
    const viewX = dragonPx - (VIEW_W * DRAGON_SCREEN_X) / this.camZoomMul;
    const viewY = -this.camGround * PPM - (VIEW_H * GROUND_SCREEN_Y) / this.camZoomMul;
    cam.centerOn(viewX + viewW / 2, viewY + viewH / 2);
    const lift = this.camGround * PPM;

    // Backdrop
    const progress = Math.min(1, Math.max(0, sim.fbX / course.length));
    for (const im of [this.sky, this.skyLate]) {
      im.setPosition(viewX - 4, viewY - 4);
      im.setDisplaySize(viewW + 8, viewH + 8);
    }
    this.skyLate.setAlpha(progress);
    const sunX = viewX + viewW * (0.76 - progress * 0.06);
    const sunY = viewY + viewH * (0.17 + progress * 0.12);
    this.sun.setPosition(sunX, sunY);
    this.rays.forEach((r, i) => {
      r.setPosition(sunX, sunY);
      r.setRotation(
        0.25 + i * 0.32 + (this.reducedMotion ? 0 : Math.sin(this.elapsed * 0.2 + i) * 0.03),
      );
      const pulse = this.reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(this.elapsed * 0.6 + i * 1.7);
      r.setAlpha(BIOMES[course.stage].rayAlpha * 0.55 * pulse);
    });
    for (const layer of this.layers) {
      const ts = layer.sprite;
      ts.setPosition(
        viewX - 8,
        viewY + (layer.bottom - layer.height) / this.camZoomMul + lift * layer.factor * 0.35,
      );
      if (ts.width !== viewW + 16) ts.setSize(viewW + 16, layer.height - 2);
      ts.tilePositionX = viewX * layer.factor + (layer.drift ?? 0) * this.elapsed;
    }
    this.lateTint.setPosition(viewX - 8, viewY - 8).setSize(viewW + 16, viewH + 16);
    this.lateTint.setFillStyle(
      this.lateTint.fillColor,
      progress * (BIOMES[course.stage].night ? 0.25 : 0.14),
    );
    this.vignette.setPosition(viewX - 8, viewY - 8).setDisplaySize(viewW + 16, viewH + 16);
    this.flash.setPosition(viewX - 8, viewY - 8).setSize(viewW + 16, viewH + 16);

    // World layers
    const leftM = viewX / PPM;
    const rightM = (viewX + viewW) / PPM;
    this.terrain.update(leftM, rightM);
    this.obstacles.update(sim, leftM, rightM, alpha, this.elapsed, this.reducedMotion);
    this.collectibles.update(sim, leftM, rightM, this.elapsed, this.reducedMotion);
    this.fx.setAmbientOrigin(viewX, viewY);

    // Dragon
    const speed = dt > 0 ? (x - this.lastRenderX) / dt : sim.speed;
    this.lastRenderX = x;
    this.rig.container.setPosition(dragonPx, -y * PPM);
    this.rig.update(
      dt,
      {
        speed: Number.isFinite(speed) && speed >= 0 ? Math.min(speed, 30) : sim.speed,
        grounded: sim.grounded,
        vy: sim.vy,
        sliding: sim.sliding,
        dashing: sim.dashTicks > 0,
        stumbling: sim.stumbleTicks > 0,
        inMud: sim.inMud,
        rescue: sim.rescue,
      },
      this.reducedMotion,
    );
    const flashing = this.elapsed - this.lastHitFlash < 0.09;
    this.rig.setTint(flashing ? 0xffffff : null);
    if (sim.invulnTicks > 0 && !flashing) {
      this.rig.setAlpha(
        this.reducedMotion ? 0.65 : Math.floor(this.elapsed * 16) % 2 === 0 ? 0.4 : 0.9,
      );
    } else {
      this.rig.setAlpha(1);
    }
    const height = Math.max(0, y - ground);
    this.shadow.setPosition(dragonPx, -ground * PPM + 2);
    this.shadow.setScale((1.6 - Math.min(0.8, height * 0.3)) / S, 1 / S);
    this.shadow.setAlpha(0.8 - Math.min(0.6, height * 0.2));
    this.shadow.setVisible(!sim.rescue || height < 0.5);
    const shieldOn = sim.shieldTicks > 0;
    this.shield.setVisible(shieldOn);
    if (shieldOn) {
      this.shield.setPosition(dragonPx + 4, -y * PPM - (sim.sliding ? 18 : 32));
      const blink =
        sim.shieldTicks < 90 && !this.reducedMotion
          ? Math.floor(this.elapsed * 10) % 2 === 0
            ? 0.35
            : 0.9
          : 0.9;
      this.shield.setAlpha(blink);
      this.shield.setScale((sim.sliding ? 1.05 : 0.95) / S, (sim.sliding ? 0.7 : 0.95) / S);
    }
    this.fx.setFlame(sim.dashTicks > 0, dragonPx - 30, -y * PPM - 30);
    if (
      sim.grounded &&
      !sim.sliding &&
      speed > 3 &&
      !this.reducedMotion &&
      Math.random() < dt * 6
    ) {
      this.fx.dustAt(dragonPx - 14, -y * PPM, 1);
    }

    // Fireball
    const cornered = gap < FIREBALL.corneredGap;
    this.fireball.update(
      x,
      Math.max(CATCH_DISTANCE * 0.5, gap),
      sim.tick * DT,
      cornered,
      this.reducedMotion,
    );
    this.fireball.root.setVisible(!(sim.outcome === 'caught'));
    if (sim.outcome === 'caught') this.fireball.trail.stop();

    // Music intensity: close chase + high flow.
    this.audio.setIntensity(Math.max(0, 1 - gap / 40) * 0.7 + (sim.flow / 10) * 0.3);

    this.updateGhosts(dt);
  }

  private updateGhosts(dt: number): void {
    const session = this.session;
    if (!session.isRace) return;
    const now = performance.now() - 120;
    for (const g of session.ghosts.values()) {
      let view = this.ghosts.get(g.userId);
      if (!view) {
        const rig = new DragonRig(this, g.skin);
        rig.container.setDepth(DEPTH.ghost);
        rig.setAlpha(0.42);
        const label = this.add
          .text(0, 0, g.name, {
            fontFamily: '"Alegreya Sans", sans-serif',
            fontStyle: '700',
            fontSize: '14px',
            color: '#fff1c2',
            stroke: '#1a120c',
            strokeThickness: 3,
            resolution: getRenderScale(),
          })
          .setOrigin(0.5, 1)
          .setDepth(DEPTH.ghost + 1)
          .setAlpha(0.85);
        view = { rig, label };
        this.ghosts.set(g.userId, view);
      }
      const [a, b] = g.samples.length === 2 ? g.samples : [g.samples[0]!, g.samples[0]!];
      if (!a || !b) continue;
      const span = Math.max(1, b.t - a.t);
      const t = Math.min(1.5, Math.max(0, (now - a.t) / span));
      const gx = a.x + (b.x - a.x) * t;
      const gy = a.y + (b.y - a.y) * t;
      const speed = ((b.x - a.x) / span) * 1000;
      view.rig.container.setPosition(gx * PPM, -gy * PPM);
      view.rig.update(
        dt,
        {
          speed: Math.max(0, speed),
          grounded: !(b.flags & RACE_FLAG.airborne),
          vy: (b.y - a.y) / (span / 1000),
          sliding: !!(b.flags & RACE_FLAG.sliding),
          dashing: !!(b.flags & RACE_FLAG.dashing),
          stumbling: false,
          inMud: false,
          rescue: false,
        },
        this.reducedMotion,
      );
      view.label.setPosition(gx * PPM, -gy * PPM - 78);
      view.label.setText(g.finished ? `${g.name} ✓` : g.name);
    }
  }
}
