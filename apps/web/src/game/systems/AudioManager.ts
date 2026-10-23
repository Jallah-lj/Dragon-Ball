/**
 * AudioManager — all sound is synthesized with the Web Audio API (no audio
 * files, no licensing concerns). Provides one-shot SFX and an adaptive,
 * biome-flavoured music loop scheduled with a look-ahead timer.
 */
import type { StageId } from '@dbfc/shared';

export type Sfx =
  | 'jump'
  | 'leap'
  | 'land'
  | 'slide'
  | 'orb'
  | 'crystal'
  | 'scale'
  | 'pickup'
  | 'hit'
  | 'stumble'
  | 'mud'
  | 'dash'
  | 'burn'
  | 'shieldUp'
  | 'shieldBlock'
  | 'boulder'
  | 'snare'
  | 'clear'
  | 'catch'
  | 'escape'
  | 'defeat'
  | 'countdown'
  | 'go'
  | 'ui';

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

const SCALES: Record<
  StageId,
  { root: number; steps: number[]; wave: OscillatorType; tempo: number }
> = {
  // Warm major pentatonic, plucked.
  emerald: { root: 293.66, steps: [0, 2, 4, 7, 9, 12, 14, 16], wave: 'triangle', tempo: 104 },
  // Dorian, airy flute-like sines.
  mistpine: { root: 261.63, steps: [0, 2, 3, 5, 7, 9, 10, 12], wave: 'sine', tempo: 96 },
  // Minor pentatonic bells.
  moonlit: { root: 220, steps: [0, 3, 5, 7, 10, 12, 15, 17], wave: 'sine', tempo: 88 },
};

let shared: AudioManager | null = null;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private volumes: Volumes = { master: 0.8, music: 0.5, sfx: 0.8, muted: false };
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private beat = 0;
  private stage: StageId = 'emerald';
  private intensity = 0;
  private orbStreak = 0;
  private lastOrbAt = 0;
  private suspendedByUser = false;

  static get(): AudioManager {
    if (!shared) shared = new AudioManager();
    return shared;
  }

  /** Must be called from a user gesture at least once (browser autoplay rules). */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended' && !this.suspendedByUser) void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolumes(v: Volumes): void {
    this.volumes = v;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.volumes.muted ? 0 : this.volumes.master;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.32, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx * 0.7, t, 0.05);
  }

  /** Pause/resume all audio (game paused or tab hidden). */
  setSuspended(suspended: boolean): void {
    this.suspendedByUser = suspended;
    if (!this.ctx) return;
    if (suspended) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  // ------------------------------------------------------------ Primitives

  private env(gain: GainNode, t: number, attack: number, peak: number, decay: number): void {
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(
    freq: number,
    opts: {
      type?: OscillatorType;
      start?: number;
      attack?: number;
      decay?: number;
      gain?: number;
      slideTo?: number;
      bus?: GainNode;
      detune?: number;
    } = {},
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = (opts.start ?? ctx.currentTime) + 0.001;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.detune) osc.detune.value = opts.detune;
    if (opts.slideTo)
      osc.frequency.exponentialRampToValueAtTime(
        opts.slideTo,
        t + (opts.attack ?? 0.01) + (opts.decay ?? 0.2),
      );
    this.env(g, t, opts.attack ?? 0.01, opts.gain ?? 0.3, opts.decay ?? 0.2);
    osc.connect(g);
    g.connect(opts.bus ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + (opts.attack ?? 0.01) + (opts.decay ?? 0.2) + 0.05);
  }

  private noiseBurst(opts: {
    start?: number;
    attack?: number;
    decay?: number;
    gain?: number;
    filter?: BiquadFilterType;
    freq?: number;
    q?: number;
    sweepTo?: number;
    bus?: GainNode;
  }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = (opts.start ?? ctx.currentTime) + 0.001;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = opts.filter ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1200, t);
    f.Q.value = opts.q ?? 1;
    if (opts.sweepTo)
      f.frequency.exponentialRampToValueAtTime(
        opts.sweepTo,
        t + (opts.attack ?? 0.01) + (opts.decay ?? 0.2),
      );
    const g = ctx.createGain();
    this.env(g, t, opts.attack ?? 0.005, opts.gain ?? 0.3, opts.decay ?? 0.2);
    src.connect(f);
    f.connect(g);
    g.connect(opts.bus ?? this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + (opts.attack ?? 0.005) + (opts.decay ?? 0.2) + 0.05);
  }

  // ------------------------------------------------------------ SFX

  play(name: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    switch (name) {
      case 'jump':
        this.noiseBurst({ freq: 500, sweepTo: 1600, decay: 0.18, gain: 0.16, q: 0.8 });
        this.tone(220, { type: 'triangle', slideTo: 330, decay: 0.12, gain: 0.06 });
        break;
      case 'leap':
        this.noiseBurst({ freq: 300, sweepTo: 2200, decay: 0.3, gain: 0.25, q: 0.7 });
        this.tone(160, { type: 'sine', slideTo: 90, decay: 0.2, gain: 0.25 });
        break;
      case 'land':
        this.noiseBurst({ filter: 'lowpass', freq: 400, decay: 0.09, gain: 0.18 });
        break;
      case 'slide':
        this.noiseBurst({ freq: 900, sweepTo: 500, attack: 0.02, decay: 0.3, gain: 0.12, q: 0.6 });
        break;
      case 'orb': {
        const t = performance.now();
        this.orbStreak = t - this.lastOrbAt < 600 ? Math.min(this.orbStreak + 1, 7) : 0;
        this.lastOrbAt = t;
        const scale = SCALES[this.stage];
        const f = scale.root * 2 * 2 ** ((scale.steps[this.orbStreak] ?? 0) / 12);
        this.tone(f, { type: 'sine', decay: 0.22, gain: 0.12 });
        this.tone(f * 2, { type: 'sine', decay: 0.12, gain: 0.04 });
        break;
      }
      case 'crystal':
        this.tone(1318.5, { type: 'triangle', decay: 0.35, gain: 0.1 });
        this.tone(1975.5, { type: 'sine', start: now + 0.05, decay: 0.4, gain: 0.08 });
        break;
      case 'scale':
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
          this.tone(f, { type: 'triangle', start: now + i * 0.07, decay: 0.5, gain: 0.12 }),
        );
        break;
      case 'pickup':
        this.tone(440, { type: 'triangle', slideTo: 880, decay: 0.25, gain: 0.14 });
        break;
      case 'hit':
        this.tone(140, { type: 'sine', slideTo: 50, decay: 0.3, gain: 0.45 });
        this.noiseBurst({ filter: 'lowpass', freq: 1800, sweepTo: 300, decay: 0.25, gain: 0.3 });
        break;
      case 'stumble':
        this.tone(200, { type: 'square', slideTo: 120, decay: 0.08, gain: 0.07 });
        this.noiseBurst({ freq: 700, decay: 0.08, gain: 0.12 });
        break;
      case 'mud':
        this.noiseBurst({
          filter: 'lowpass',
          freq: 600,
          sweepTo: 180,
          attack: 0.02,
          decay: 0.3,
          gain: 0.25,
          q: 6,
        });
        break;
      case 'dash':
        this.noiseBurst({ freq: 300, sweepTo: 3000, attack: 0.03, decay: 0.45, gain: 0.3, q: 0.9 });
        this.tone(90, { type: 'sawtooth', slideTo: 180, attack: 0.03, decay: 0.4, gain: 0.08 });
        break;
      case 'burn':
        for (let i = 0; i < 5; i++)
          this.noiseBurst({
            start: now + i * 0.03,
            freq: 2000 + i * 400,
            decay: 0.05,
            gain: 0.12,
            q: 2,
          });
        break;
      case 'shieldUp':
        [392, 493.88, 587.33].forEach((f, i) =>
          this.tone(f, {
            type: 'sine',
            start: now + i * 0.04,
            attack: 0.05,
            decay: 0.6,
            gain: 0.07,
          }),
        );
        break;
      case 'shieldBlock':
        this.tone(1046.5, { type: 'triangle', decay: 0.4, gain: 0.14 });
        this.tone(1568, { type: 'sine', decay: 0.3, gain: 0.08, detune: 8 });
        break;
      case 'boulder':
        this.noiseBurst({ filter: 'lowpass', freq: 160, attack: 0.1, decay: 1.2, gain: 0.4 });
        break;
      case 'snare':
        this.tone(660, { type: 'sine', slideTo: 990, attack: 0.05, decay: 0.3, gain: 0.05 });
        break;
      case 'clear':
        this.tone(880, { type: 'sine', decay: 0.06, gain: 0.03 });
        break;
      case 'catch':
        [293.66, 369.99, 440, 587.33, 739.99, 880].forEach((f, i) => {
          this.tone(f, {
            type: 'sawtooth',
            start: now + i * 0.09,
            attack: 0.02,
            decay: 0.6,
            gain: 0.05,
          });
          this.tone(f, { type: 'triangle', start: now + i * 0.09, decay: 0.7, gain: 0.08 });
        });
        this.noiseBurst({ freq: 500, sweepTo: 4000, decay: 0.8, gain: 0.2 });
        break;
      case 'escape':
        [440, 392, 349.23, 293.66].forEach((f, i) =>
          this.tone(f, { type: 'triangle', start: now + i * 0.18, decay: 0.5, gain: 0.1 }),
        );
        break;
      case 'defeat':
        [329.63, 293.66, 261.63, 196].forEach((f, i) =>
          this.tone(f, { type: 'sine', start: now + i * 0.2, decay: 0.6, gain: 0.12 }),
        );
        break;
      case 'countdown':
        this.tone(587.33, { type: 'triangle', decay: 0.18, gain: 0.15 });
        break;
      case 'go':
        this.tone(880, { type: 'triangle', decay: 0.4, gain: 0.18 });
        this.tone(1174.66, { type: 'sine', decay: 0.4, gain: 0.08 });
        break;
      case 'ui':
        this.tone(660, { type: 'sine', decay: 0.05, gain: 0.04 });
        break;
    }
  }

  // ------------------------------------------------------------ Music

  /** 0 (calm) … 1 (closing in on the fireball). */
  setIntensity(v: number): void {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  startMusic(stage: StageId): void {
    this.stage = stage;
    if (!this.ctx || this.musicTimer) return;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.beat = 0;
    this.musicTimer = setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const s = SCALES[this.stage];
    const sixteenth = 60 / s.tempo / 4;
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      const t = this.nextNoteTime;
      const step = this.beat % 64;
      const bar = Math.floor(this.beat / 16) % 4;
      const chordRoot = [0, 5, 3, 4][bar]!;
      const note = (deg: number, oct = 1) =>
        s.root *
        oct *
        2 **
          ((s.steps[(deg + chordRoot) % s.steps.length]! +
            (deg + chordRoot >= s.steps.length ? 12 : 0)) /
            12);
      // Drone / bass on each bar.
      if (step % 16 === 0) {
        this.tone(note(0, 0.25), {
          type: 'sine',
          start: t,
          attack: 0.3,
          decay: sixteenth * 15,
          gain: 0.22,
          bus: this.musicBus,
        });
        this.tone(note(2, 0.5), {
          type: 'triangle',
          start: t,
          attack: 0.4,
          decay: sixteenth * 14,
          gain: 0.06,
          bus: this.musicBus,
        });
      }
      // Plucked arpeggio.
      if (step % 2 === 0) {
        const pattern = [0, 2, 4, 2, 5, 4, 2, 1];
        const deg = pattern[(step / 2) % pattern.length]!;
        this.tone(note(deg, 1), {
          type: s.wave,
          start: t,
          attack: 0.005,
          decay: sixteenth * 3,
          gain: 0.07,
          bus: this.musicBus,
        });
      }
      // Higher counter-melody as intensity rises.
      if (this.intensity > 0.45 && step % 4 === 1) {
        this.tone(note([4, 5, 7, 5][(step >> 2) % 4]!, 2), {
          type: 'sine',
          start: t,
          decay: sixteenth * 3,
          gain: 0.035 * this.intensity,
          bus: this.musicBus,
        });
      }
      // Soft percussion: frame-drum pulse and shaker.
      if (step % 8 === 0) {
        this.tone(110, {
          type: 'sine',
          start: t,
          slideTo: 55,
          decay: 0.18,
          gain: 0.12 + 0.12 * this.intensity,
          bus: this.musicBus,
        });
      }
      if (this.intensity > 0.2 && step % 2 === 1) {
        this.noiseBurst({
          start: t,
          filter: 'highpass',
          freq: 6000,
          decay: 0.03,
          gain: 0.03 * this.intensity,
          bus: this.musicBus,
        });
      }
      this.nextNoteTime += sixteenth;
      this.beat++;
    }
  }
}
