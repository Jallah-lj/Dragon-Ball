import * as Phaser from 'phaser';
import {
  ABILITIES,
  BOOST,
  DT,
  ENERGY,
  FLOW,
  OBSTACLE_INFO,
  type ChaseSimulation,
} from '@dbfc/shared';
import { getRenderScale } from '../art/canvas';
import { hudTextures } from '../art/hud';
import { PPM, VIEW_H, VIEW_W, DRAGON_SCREEN_X } from '../constants';
import type { GameSession } from '../session/GameSession';
import { AudioManager } from '../systems/AudioManager';
import { keyLabel, prefersReducedMotion, settingsStore } from '../../lib/settings';

const PANEL = 0x0d120e;
const GOLD = 0xc9963f;

interface AbilitySlot {
  icon: Phaser.GameObjects.Image;
  lock: Phaser.GameObjects.Image;
  arc: Phaser.GameObjects.Graphics;
  key: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  x: number;
  y: number;
  last: string;
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Minimal, readable heads-up display drawn over the forest. */
export class HudScene extends Phaser.Scene {
  private session!: GameSession;
  private hearts: Phaser.GameObjects.Image[] = [];
  private score!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private trackG!: Phaser.GameObjects.Graphics;
  private dragonMarker!: Phaser.GameObjects.Image;
  private fireMarker!: Phaser.GameObjects.Image;
  private gapText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private slots: AbilitySlot[] = [];
  private flowG!: Phaser.GameObjects.Graphics;
  private flowText!: Phaser.GameObjects.Text;
  private countdown!: Phaser.GameObjects.Text;
  private warnings: Phaser.GameObjects.Image[] = [];
  private warnLabels: Phaser.GameObjects.Text[] = [];
  private standings!: Phaser.GameObjects.Text;
  private fps!: Phaser.GameObjects.Text;
  private lastCountdown = '';
  private textCache: Record<string, string> = {};
  private reducedMotion = false;

  constructor() {
    super('hud');
  }

  private text(
    x: number,
    y: number,
    size: number,
    opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, '', {
      fontFamily: '"Alegreya Sans", sans-serif',
      fontStyle: '800',
      fontSize: `${size}px`,
      color: '#f4ead2',
      stroke: '#0d120e',
      strokeThickness: 4,
      resolution: getRenderScale(),
      ...opts,
    });
  }

  private set(t: Phaser.GameObjects.Text, id: string, value: string): void {
    if (this.textCache[id] !== value) {
      this.textCache[id] = value;
      t.setText(value);
    }
  }

  create(): void {
    this.session = this.registry.get('session') as GameSession;
    const S = getRenderScale();
    this.cameras.main.setZoom(S);
    this.cameras.main.centerOn(VIEW_W / 2, VIEW_H / 2);
    this.reducedMotion = prefersReducedMotion(settingsStore.get());
    hudTextures(this, this.session.skin);
    this.textCache = {};
    this.hearts = [];
    this.slots = [];
    this.warnings = [];
    this.warnLabels = [];
    const s0 = 1 / S;
    const sim = this.session.sim;
    const tutorial = this.session.mode === 'tutorial';

    // Hearts + score (top-left)
    const panel = this.add.graphics();
    panel.fillStyle(PANEL, 0.55).lineStyle(1, GOLD, 0.45);
    panel.fillRoundedRect(14, 12, 236, 84, 12).strokeRoundedRect(14, 12, 236, 84, 12);
    for (let i = 0; i < sim.maxHearts; i++) {
      this.hearts.push(this.add.image(42 + i * 36, 36, 'hud-heart').setScale(s0));
    }
    this.score = this.text(28, 54, 26);
    this.status = this.text(28, 104, 15, { fontStyle: '700', color: '#e6d6b2' });

    // Chase track (top-centre)
    this.trackG = this.add.graphics();
    this.dragonMarker = this.add.image(0, 34, `hud-dragon-${this.session.skin}`).setScale(s0);
    this.fireMarker = this.add.image(0, 34, 'hud-fireball').setScale(s0 * 1.2);
    this.add.image(VIEW_W / 2 + 250, 32, 'hud-shrine').setScale(s0);
    this.gapText = this.text(VIEW_W / 2, 52, 17, { fontStyle: '700' }).setOrigin(0.5, 0);

    // Distance / time (top-right)
    this.distText = this.text(VIEW_W - 76, 22, 18, { fontStyle: '700', align: 'right' }).setOrigin(
      1,
      0,
    );
    const pause = this.add
      .image(VIEW_W - 40, 40, 'hud-pause')
      .setScale(s0)
      .setInteractive({ useHandCursor: true });
    pause.on('pointerdown', () => this.session.togglePause());
    pause.setVisible(this.session.mode !== 'attract');
    this.standings = this.text(VIEW_W - 24, 76, 15, {
      fontStyle: '700',
      align: 'right',
      lineSpacing: 4,
    }).setOrigin(1, 0);

    // Abilities (bottom-left)
    const binds = settingsStore.get().keybinds;
    const defs: [string, string][] = [
      ['hud-dash', keyLabel(binds.dash[0] ?? 'ShiftLeft')],
      ['hud-leap', `${keyLabel(binds.jump[0] ?? 'Space')} ×2`],
      ['hud-shield', keyLabel(binds.shield[0] ?? 'KeyE')],
    ];
    const bar = this.add.graphics();
    bar.fillStyle(PANEL, 0.55).lineStyle(1, GOLD, 0.45);
    bar
      .fillRoundedRect(14, VIEW_H - 112, 470, 100, 14)
      .strokeRoundedRect(14, VIEW_H - 112, 470, 100, 14);
    defs.forEach(([icon, key], i) => {
      const x = 56 + i * 80;
      const y = VIEW_H - 72;
      const ring = this.add.graphics();
      ring
        .fillStyle(0x0d120e, 0.85)
        .fillCircle(x, y, 28)
        .lineStyle(2, GOLD, 0.8)
        .strokeCircle(x, y, 28);
      const img = this.add.image(x, y, icon).setScale(s0);
      const arc = this.add.graphics();
      const lock = this.add
        .image(x + 16, y - 18, 'hud-lock')
        .setScale(s0)
        .setVisible(false);
      const keyT = this.text(x, y + 30, 13, {
        fontStyle: '700',
        color: '#cdb98f',
        strokeThickness: 3,
      }).setOrigin(0.5, 0);
      keyT.setText(key);
      const status = this.text(x, y - 46, 12, { fontStyle: '700', strokeThickness: 3 }).setOrigin(
        0.5,
        0,
      );
      this.slots.push({ icon: img, lock, arc, key: keyT, status, x, y, last: '' });
    });
    this.flowG = this.add.graphics();
    this.add.text(278, VIEW_H - 100, 'FLOW', {
      fontFamily: '"Alegreya SC", serif',
      fontSize: '15px',
      color: '#cdb98f',
      resolution: getRenderScale(),
    });
    this.flowText = this.text(278, VIEW_H - 50, 14, {
      fontStyle: '700',
      color: '#e6d6b2',
      strokeThickness: 3,
    });

    // Warnings (right edge)
    for (let i = 0; i < 3; i++) {
      this.warnings.push(
        this.add
          .image(VIEW_W - 34, 0, 'hud-warn')
          .setScale(s0)
          .setVisible(false),
      );
      this.warnLabels.push(
        this.text(VIEW_W - 56, 0, 13, { fontStyle: '700', strokeThickness: 3 })
          .setOrigin(1, 0.5)
          .setVisible(false),
      );
    }

    this.countdown = this.add
      .text(VIEW_W / 2, VIEW_H * 0.38, '', {
        fontFamily: '"Grenze Gotisch Variable", "Grenze Gotisch", serif',
        fontSize: '120px',
        fontStyle: '700',
        color: '#ffe7a3',
        stroke: '#1a120c',
        strokeThickness: 10,
        resolution: getRenderScale(),
      })
      .setOrigin(0.5);
    this.fps = this.text(VIEW_W - 24, VIEW_H - 30, 12, {
      fontStyle: '700',
      color: '#a9c27a',
    }).setOrigin(1, 0);

    if (tutorial) {
      this.slots[2]?.icon.setAlpha(0.3);
    }
    if (this.session.mode === 'attract') this.cameras.main.setVisible(false);
  }

  override update(): void {
    const session = this.session;
    if (!session || session.mode === 'attract') return;
    const sim = session.sim;
    const settings = settingsStore.get();

    // Hearts
    this.hearts.forEach((h, i) => h.setTexture(i < sim.hearts ? 'hud-heart' : 'hud-heart-empty'));
    this.set(this.score, 'score', sim.provisionalScore().toLocaleString('en-US'));
    const st: string[] = [];
    if (sim.boostTicks > 0) st.push(`Tailwind ${(sim.boostTicks * DT).toFixed(1)}s`);
    if (sim.shieldTicks > 0) st.push(`Shield ${(sim.shieldTicks * DT).toFixed(0)}s`);
    if (sim.inMud) st.push('Mud — slowed');
    if (sim.stumbleTicks > 0) st.push('Stumbled');
    this.set(this.status, 'status', st.join('  ·  '));

    // Chase track
    const length = sim.course.length;
    const x0 = VIEW_W / 2 - 250;
    const w = 500;
    const g = this.trackG;
    g.clear();
    g.fillStyle(PANEL, 0.6).fillRoundedRect(x0 - 16, 16, w + 44, 62, 12);
    g.lineStyle(1, GOLD, 0.45).strokeRoundedRect(x0 - 16, 16, w + 44, 62, 12);
    g.fillStyle(0x2a3a2a, 1).fillRoundedRect(x0, 30, w, 8, 4);
    const dx = x0 + w * Math.min(1, Math.max(0, sim.x / length));
    const fx = x0 + w * Math.min(1, Math.max(0, sim.fbX / length));
    g.fillStyle(0xe8a33d, 0.9).fillRect(dx, 31, Math.max(0, fx - dx), 6);
    this.dragonMarker.setX(dx);
    this.fireMarker.setX(fx);
    const gap = Math.max(0, sim.gap);
    const gapLabel =
      sim.outcome === 'caught'
        ? 'Caught!'
        : gap < 6
          ? `Almost there! ${gap.toFixed(1)} m`
          : `Fireball ${Math.round(gap)} m ahead`;
    this.set(this.gapText, 'gap', gapLabel);

    this.set(this.distText, 'dist', `${Math.floor(sim.x)} m   ${fmtTime(sim.tick * DT)}`);

    // Abilities
    this.updateSlot(0, sim, 'dash');
    this.updateSlot(1, sim, 'leap');
    this.updateSlot(2, sim, 'shield');

    // Flow meter
    const fg = this.flowG;
    fg.clear();
    for (let i = 0; i < FLOW.max; i++) {
      const filled = sim.flow >= i + 1 ? 1 : Math.max(0, sim.flow - i);
      const sx = 278 + i * 19;
      fg.fillStyle(0x1b291d, 1).fillRect(sx, VIEW_H - 78, 15, 20);
      if (filled > 0)
        fg.fillStyle(i >= 7 ? 0xffc35c : 0xe8a33d, 1).fillRect(
          sx,
          VIEW_H - 78 + 20 * (1 - filled),
          15,
          20 * filled,
        );
      fg.lineStyle(1, 0xc9963f, 0.6).strokeRect(sx, VIEW_H - 78, 15, 20);
    }
    const bonus = Math.round(sim.flow * FLOW.speedPerLevel * 100);
    this.set(
      this.flowText,
      'flow',
      sim.flow >= FLOW.max ? `MAX — +${bonus}% speed` : `+${bonus}% speed`,
    );

    // Countdown
    const cd = session.countdown();
    let cdText = '';
    if (cd > 0) cdText = String(Math.ceil(cd / 1000));
    else if (cd > -700 && session.sim.tick < 60) cdText = 'GO!';
    if (cdText !== this.lastCountdown) {
      if (cdText) AudioManager.get().play(cdText === 'GO!' ? 'go' : 'countdown');
      this.lastCountdown = cdText;
      this.countdown.setText(cdText);
      if (cdText && !this.reducedMotion) {
        this.countdown.setScale(1.4).setAlpha(1);
        this.tweens.add({ targets: this.countdown, scale: 1, duration: 260, ease: 'Back.easeOut' });
      }
    }
    if (!cdText) this.countdown.setText('');

    this.updateWarnings(sim);
    this.updateStandings(sim);
    this.fps.setVisible(settings.showFps);
    if (settings.showFps) this.set(this.fps, 'fps', `${Math.round(this.game.loop.actualFps)} fps`);
  }

  private updateSlot(i: number, sim: ChaseSimulation, kind: 'dash' | 'leap' | 'shield'): void {
    const slot = this.slots[i]!;
    const arc = slot.arc;
    arc.clear();
    let status: string;
    let fraction = 0;
    let locked = false;
    let active = false;
    if (kind === 'dash') {
      const charge = Math.min(1, sim.energy / ABILITIES.dash.energyCost);
      arc.lineStyle(4, 0xffc35c, 1);
      arc.beginPath();
      arc.arc(
        slot.x,
        slot.y,
        33,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.min(1, sim.energy / ENERGY.max),
        false,
      );
      arc.strokePath();
      if (sim.dashTicks > 0) {
        active = true;
        status = 'Blazing';
      } else if (sim.tick < sim.dashReadyAt) {
        fraction = (sim.dashReadyAt - sim.tick) / ABILITIES.dash.cooldownTicks;
        status = `${((sim.dashReadyAt - sim.tick) * DT).toFixed(1)}s`;
      } else if (charge < 1) {
        fraction = 1 - charge;
        status = `${Math.floor(sim.energy)}/${ABILITIES.dash.energyCost}`;
      } else status = 'Ready';
    } else if (kind === 'leap') {
      locked = !sim.config.abilities.leap;
      if (sim.tick < sim.leapReadyAt) {
        fraction = (sim.leapReadyAt - sim.tick) / ABILITIES.leap.cooldownTicks;
        status = `${((sim.leapReadyAt - sim.tick) * DT).toFixed(1)}s`;
      } else status = locked ? 'Locked' : 'Ready';
    } else {
      locked = !sim.config.abilities.shield;
      if (sim.shieldTicks > 0) {
        active = true;
        status = 'Active';
      } else if (locked) status = 'Locked';
      else if (sim.tick < sim.shieldReadyAt) {
        fraction = (sim.shieldReadyAt - sim.tick) / ABILITIES.shield.cooldownTicks;
        status = `${Math.ceil((sim.shieldReadyAt - sim.tick) * DT)}s`;
      } else status = 'Ready';
    }
    if (fraction > 0) {
      arc.fillStyle(0x000000, 0.6);
      arc.slice(slot.x, slot.y, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction, false);
      arc.fillPath();
    }
    if (active) {
      arc.lineStyle(3, 0xfff1c2, 1).strokeCircle(slot.x, slot.y, 29);
    }
    slot.icon.setAlpha(locked ? 0.3 : fraction > 0 ? 0.6 : 1);
    slot.lock.setVisible(locked);
    if (slot.last !== status) {
      slot.last = status;
      slot.status.setText(status);
      slot.status.setColor(status === 'Ready' ? '#c9e59a' : active ? '#ffe7a3' : '#e6d6b2');
    }
  }

  private updateWarnings(sim: ChaseSimulation): void {
    const obs = sim.course.obstacles;
    let n = 0;
    const visibleAhead = (VIEW_W * (1 - DRAGON_SCREEN_X)) / PPM;
    for (let i = 0; i < obs.length && n < this.warnings.length; i++) {
      const o = obs[i]!;
      if (o.x < sim.x) continue;
      const dist = o.x - sim.x;
      if (dist > visibleAhead + 14) break;
      if (!OBSTACLE_INFO[o.kind].warn) continue;
      const boulderRolling = o.kind === 'boulder' && sim.obsActive[i] === 1;
      // Warn about moving hazards just before they scroll into view.
      if (dist < visibleAhead - 2 && !boulderRolling) continue;
      if (dist > visibleAhead + 14) continue;
      const w = this.warnings[n]!;
      const label = this.warnLabels[n]!;
      const y = VIEW_H * 0.6 - (o.kind === 'swing' ? 40 : 0);
      w.setVisible(true).setY(y);
      label.setVisible(true).setY(y);
      label.setText(`${OBSTACLE_INFO[o.kind].name} ${Math.round(dist)} m`);
      if (!this.reducedMotion) w.setAlpha(0.65 + 0.35 * Math.sin(this.time.now / 90));
      n++;
    }
    for (let i = n; i < this.warnings.length; i++) {
      this.warnings[i]!.setVisible(false);
      this.warnLabels[i]!.setVisible(false);
    }
  }

  private updateStandings(sim: ChaseSimulation): void {
    const session = this.session;
    if (!session.isRace) {
      this.standings.setVisible(false);
      return;
    }
    const rows: { name: string; x: number; you: boolean; done: boolean }[] = [
      { name: 'You', x: sim.x, you: true, done: sim.over },
    ];
    for (const g of session.ghosts.values()) {
      const last = g.samples[g.samples.length - 1];
      if (last) rows.push({ name: g.name, x: last.x, you: false, done: g.finished });
    }
    rows.sort((a, b) => b.x - a.x);
    const text = rows
      .map((r, i) => `${i + 1}. ${r.name}${r.done ? ' ✓' : ''}  ${Math.floor(r.x)} m`)
      .join('\n');
    this.standings.setVisible(true);
    this.set(this.standings, 'standings', text);
  }
}

export const BOOST_SECONDS = BOOST.ticks * DT;
