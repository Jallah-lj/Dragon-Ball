/**
 * Deterministic course generation (ObstacleManager / CollectibleManager data).
 *
 * A course is generated entirely up front from a 32-bit seed. The same seed,
 * difficulty and stage always produce the exact same course on the client and
 * on the server, which is what makes replay verification possible.
 *
 * Fairness rules enforced here:
 *  - courses are built from hand-designed patterns that are individually clearable;
 *  - pattern spacing is expressed in seconds of travel at the expected speed, so
 *    reaction windows scale with speed;
 *  - obstacles always sit on flat ground; slopes only appear between patterns;
 *  - moving boulders have a reserved lane and stop before reaching earlier hazards;
 *  - the shared autopilot test suite plays hundreds of seeds to prove clearability.
 */
import { SNARE, SWING } from './constants';
import { DIFFICULTIES, type Difficulty, type DifficultyConfig } from './difficulty';
import { Rng } from './rng';
import { STAGES, type StageConfig, type StageId } from './stages';

export const OBSTACLE_KINDS = [
  'log',
  'rock',
  'trunk',
  'branch',
  'thorns',
  'roots',
  'mud',
  'gap',
  'boulder',
  'swing',
  'snare',
] as const;
export type ObstacleKind = (typeof OBSTACLE_KINDS)[number];

export type ObstacleEffect = 'damage' | 'stumble' | 'slow' | 'pit';

export interface ObstacleInfo {
  name: string;
  effect: ObstacleEffect;
  /** Primary way to deal with it (used by the tutorial and help screens). */
  hint: string;
  /** Moving / timed hazards get an edge-of-screen warning. */
  warn: boolean;
}

export const OBSTACLE_INFO: Record<ObstacleKind, ObstacleInfo> = {
  log: { name: 'Fallen log', effect: 'damage', hint: 'Jump over it.', warn: false },
  rock: { name: 'Mossy rock', effect: 'damage', hint: 'A short hop clears it.', warn: false },
  trunk: {
    name: 'Ancient trunk',
    effect: 'damage',
    hint: 'Hold jump for full height.',
    warn: false,
  },
  branch: { name: 'Low branch', effect: 'damage', hint: 'Slide underneath.', warn: false },
  thorns: {
    name: 'Thorn bush',
    effect: 'damage',
    hint: 'Jump over it, or Fire Dash straight through.',
    warn: false,
  },
  roots: {
    name: 'Tangled roots',
    effect: 'stumble',
    hint: 'Hop over to keep your flow.',
    warn: false,
  },
  mud: {
    name: 'Mud patch',
    effect: 'slow',
    hint: 'Jump across to avoid slowing down.',
    warn: false,
  },
  gap: { name: 'Broken bridge', effect: 'pit', hint: 'Jump the gap.', warn: false },
  boulder: { name: 'Rolling boulder', effect: 'damage', hint: 'Time your jump.', warn: true },
  swing: {
    name: 'Swinging vine-log',
    effect: 'damage',
    hint: 'Slide under it, or keep running while it swings high.',
    warn: true,
  },
  snare: {
    name: 'Wisp snare',
    effect: 'damage',
    hint: 'Cross while dormant or jump while it blazes.',
    warn: true,
  },
};

export const COLLECTIBLE_KINDS = ['orb', 'crystal', 'shield', 'boost', 'scale'] as const;
export type CollectibleKind = (typeof COLLECTIBLE_KINDS)[number];

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  /** Left edge of the occupied region (m). For boulders: the starting position. */
  x: number;
  /** Width of the occupied region (m). */
  w: number;
  /** Static collision box bottom/top relative to the ground (m). */
  y0: number;
  y1: number;
  /** Absolute ground height under the obstacle (m). */
  ground: number;
  /** Visual variant (0-3), purely cosmetic. */
  variant: number;
  /** Boulder: roll speed toward the dragon (m/s). */
  speed: number;
  /** Boulder: starts rolling when the dragon is within this distance (m). */
  trigger: number;
  /** Boulder: left-most position it can roll to (m). */
  stopX: number;
  /** Swing / snare: cycle period in ticks. */
  period: number;
  /** Swing / snare: phase offset in ticks. */
  phase: number;
  /** Swing: horizontal centre of the hanging log (m). */
  pivot: number;
}

export interface Collectible {
  id: number;
  kind: CollectibleKind;
  x: number;
  /** Absolute height (m). */
  y: number;
}

export interface Course {
  seed: number;
  difficulty: Difficulty;
  stage: StageId;
  tutorial: boolean;
  /** Distance of the Ember Shrine; the fireball escapes when it gets there. */
  length: number;
  startGap: number;
  obstacles: Obstacle[];
  collectibles: Collectible[];
  /** Piecewise-linear terrain profile. */
  terrainX: number[];
  terrainH: number[];
  /** Flattened, sorted [x0, x1, x0, x1, ...] gap spans. */
  pits: number[];
  /** Fireball hover height (m above ground) per second of travel — render only. */
  hover: number[];
  /** Seed for purely cosmetic decoration. */
  decorSeed: number;
}

export interface CourseParams {
  seed: number;
  difficulty: Difficulty;
  stage: StageId;
  tutorial?: boolean;
}

interface PendingCollectible {
  kind: CollectibleKind;
  x: number;
  yRel: number;
}

class CourseBuilder {
  readonly obstacles: Obstacle[] = [];
  readonly pending: PendingCollectible[] = [];
  readonly terrainX: number[] = [-120];
  readonly terrainH: number[] = [0];
  readonly pits: number[] = [];
  h = 0;

  constructor(
    readonly rng: Rng,
    readonly diff: DifficultyConfig,
    readonly stage: StageConfig,
  ) {}

  /** Expected cruising speed when the dragon reaches `x` (moderate flow assumed). */
  speedAt(x: number): number {
    const base = this.diff.baseSpeed;
    const seconds = Math.max(0, x) / (base * 1.05);
    const ramp = 1 + Math.min(this.diff.rampMax, seconds * this.diff.rampPerSecond);
    return base * ramp * 1.08;
  }

  meters(seconds: number, x: number): number {
    return seconds * this.speedAt(x);
  }

  obstacle(
    kind: ObstacleKind,
    x: number,
    w: number,
    y0: number,
    y1: number,
    extra: Partial<Obstacle> = {},
  ): Obstacle {
    const o: Obstacle = {
      id: 0,
      kind,
      x,
      w,
      y0,
      y1,
      ground: this.h,
      variant: this.rng.int(0, 3),
      speed: 0,
      trigger: 0,
      stopX: 0,
      period: 0,
      phase: 0,
      pivot: 0,
      ...extra,
    };
    this.obstacles.push(o);
    return o;
  }

  collect(kind: CollectibleKind, x: number, yRel: number): void {
    this.pending.push({ kind, x, yRel });
  }

  /** Parabolic arc of pickups tracing a natural jump. */
  arc(x0: number, x1: number, peak: number, count: number, kind: CollectibleKind = 'orb'): void {
    const base = 0.9;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      this.collect(kind, x0 + (x1 - x0) * t, base + (peak - base) * 4 * t * (1 - t));
    }
  }

  line(
    x0: number,
    count: number,
    spacing: number,
    yRel: number,
    kind: CollectibleKind = 'orb',
  ): void {
    for (let i = 0; i < count; i++) this.collect(kind, x0 + i * spacing, yRel);
  }

  slope(x: number, length: number, dh: number): void {
    const lastX = this.terrainX[this.terrainX.length - 1] ?? -120;
    if (x > lastX) {
      this.terrainX.push(x);
      this.terrainH.push(this.h);
    }
    this.h += dh;
    this.terrainX.push(x + length);
    this.terrainH.push(this.h);
  }
}

// ---------------------------------------------------------------------------
// Pattern building blocks
// ---------------------------------------------------------------------------

function buildLog(b: CourseBuilder, x: number, rewards = true): number {
  const w = b.rng.range(1.2, 1.6);
  b.obstacle('log', x, w, 0, 0.8);
  if (rewards && b.rng.chance(0.75)) {
    const span = b.meters(0.62, x);
    b.arc(x + w / 2 - span / 2, x + w / 2 + span / 2, 2.5, 5);
  }
  return x + w;
}

function buildRock(b: CourseBuilder, x: number, rewards = true): number {
  const w = b.rng.range(0.9, 1.15);
  const h = b.rng.range(0.55, 0.7);
  b.obstacle('rock', x, w, 0, h);
  if (rewards && b.rng.chance(0.5)) b.collect('orb', x + w / 2, h + 1.1);
  return x + w;
}

function buildTrunk(b: CourseBuilder, x: number, rewards = true): number {
  const w = b.rng.range(1.05, 1.3);
  const h = b.diff.tier === 0 ? 1.15 : 1.3;
  b.obstacle('trunk', x, w, 0, h);
  // Pickups register along the dragon's whole body (1.3 m + padding), so 3.25 m
  // is only reachable with a full-height jump (apex ≈ 1.93 m).
  if (rewards) b.collect('crystal', x + w / 2, 3.25);
  return x + w;
}

function buildBranch(b: CourseBuilder, x: number, rewards = true): number {
  const w = b.rng.range(2.0, 2.6);
  b.obstacle('branch', x, w, 1.0, 3.9);
  if (rewards && b.rng.chance(0.7)) b.line(x + 0.4, 3, (w - 0.8) / 2, 0.35);
  return x + w;
}

/**
 * Conservative "slow case" speed at x: 90% of the base speed (with ramp), e.g.
 * right after the run starts or while recovering from a stumble. Wide hazards
 * are sized so a full jump clears them even at this speed.
 */
function slowSpeed(b: CourseBuilder, x: number): number {
  return (b.speedAt(x) / 1.08) * 0.9;
}

function buildThorns(b: CourseBuilder, x: number, rewards = true): number {
  // A full jump stays above 0.75 m for ~0.46 s; the dragon is 1.44 m long.
  const maxW = Math.min(2.7, 0.46 * slowSpeed(b, x) - 1.44);
  const w = b.rng.range(Math.min(2.0, maxW * 0.85), maxW);
  b.obstacle('thorns', x, w, 0, 0.75);
  if (rewards && b.rng.chance(0.7)) {
    const span = b.meters(0.66, x);
    b.arc(x + w / 2 - span / 2, x + w / 2 + span / 2, 2.4, 5);
  }
  return x + w;
}

function buildRoots(b: CourseBuilder, x: number): number {
  const w = b.rng.range(1.6, 2.2);
  b.obstacle('roots', x, w, 0, 0.38);
  return x + w;
}

function buildMud(b: CourseBuilder, x: number, rewards = true): number {
  // A full jump lasts ~0.65 s; leave room for the 0.9 m support span and a margin.
  const maxW = Math.min(6, Math.max(2.6, 0.62 * slowSpeed(b, x) - 1.3));
  const w = b.rng.range(0.72, 1) * maxW;
  b.obstacle('mud', x, w, 0, 0.12);
  if (rewards) {
    const span = Math.max(w + 1.6, b.meters(0.64, x));
    b.arc(x + w / 2 - span / 2, x + w / 2 + span / 2, 2.6, 3, 'crystal');
  }
  return x + w;
}

function buildGap(b: CourseBuilder, x: number, rewards = true): number {
  const w =
    b.diff.tier === 0
      ? b.rng.range(2.4, 3.0)
      : b.diff.tier === 1
        ? b.rng.range(2.6, 3.6)
        : b.rng.range(3.0, 4.2);
  b.obstacle('gap', x, w, -12, 0);
  b.pits.push(x, x + w);
  if (rewards) {
    const span = Math.max(w + 2, b.meters(0.6, x));
    b.arc(x + w / 2 - span / 2, x + w / 2 + span / 2, 2.3, 5);
  }
  return x + w;
}

function buildBoulder(b: CourseBuilder, x: number): number {
  const speed = b.diff.boulderSpeed;
  const trigger = 34;
  const v = b.speedAt(x);
  const expectedTravel = (trigger / (v + speed)) * speed;
  const place = x + expectedTravel + 4;
  b.obstacle('boulder', place, 1.1, 0, 1.05, { speed, trigger, stopX: x });
  return place + 1.1;
}

function buildSwing(b: CourseBuilder, x: number): number {
  const w = SWING.logWidth;
  b.obstacle('swing', x, w, SWING.lowBottom, SWING.lowBottom + SWING.logHeight, {
    pivot: x + w / 2,
    period: b.diff.swingPeriod,
    phase: b.rng.int(0, b.diff.swingPeriod - 1),
  });
  return x + w;
}

function buildSnare(b: CourseBuilder, x: number): number {
  const w = 1.6;
  b.obstacle('snare', x, w, 0, SNARE.activeHeight, {
    period: b.diff.snarePeriod,
    phase: b.rng.int(0, b.diff.snarePeriod - 1),
  });
  return x + w;
}

interface Pattern {
  id: string;
  tags: readonly string[];
  /** Weight per difficulty [easy, medium, hard]; 0 disables. */
  weight: readonly [number, number, number];
  build(b: CourseBuilder, x: number): number;
}

const combo = (b: CourseBuilder, end: number, scale = 1): number =>
  end + b.meters(b.diff.comboSpacing * scale, end);

export const PATTERNS: readonly Pattern[] = [
  { id: 'log', tags: ['log'], weight: [5, 3, 2], build: (b, x) => buildLog(b, x) },
  { id: 'rock', tags: ['rock'], weight: [4, 2.5, 1.5], build: (b, x) => buildRock(b, x) },
  { id: 'trunk', tags: ['trunk'], weight: [1.5, 2.5, 2.5], build: (b, x) => buildTrunk(b, x) },
  { id: 'branch', tags: ['branch'], weight: [3, 3, 2.5], build: (b, x) => buildBranch(b, x) },
  { id: 'thorns', tags: ['thorns'], weight: [3, 3, 2.5], build: (b, x) => buildThorns(b, x) },
  { id: 'roots', tags: ['roots'], weight: [2.5, 2, 1.5], build: (b, x) => buildRoots(b, x) },
  { id: 'mud', tags: ['mud'], weight: [2, 2, 1.5], build: (b, x) => buildMud(b, x) },
  { id: 'gap', tags: ['gap'], weight: [2, 2.5, 2.5], build: (b, x) => buildGap(b, x) },
  { id: 'boulder', tags: ['boulder'], weight: [0.8, 2, 2.5], build: (b, x) => buildBoulder(b, x) },
  { id: 'swing', tags: ['swing'], weight: [0, 2, 2.5], build: (b, x) => buildSwing(b, x) },
  { id: 'snare', tags: ['snare'], weight: [0, 1.5, 2], build: (b, x) => buildSnare(b, x) },
  {
    id: 'rockPair',
    tags: ['rock'],
    weight: [1, 1.5, 1.5],
    build: (b, x) => {
      const end = buildRock(b, x, false);
      const w = end - x;
      // Either a tight pair (one full jump clears both) or a hop-hop pair whose
      // landing pocket is sized from the expected speed.
      const tight = b.diff.tier > 0 && b.rng.chance(0.5);
      const gap = tight ? b.rng.range(0.9, 1.3) : 0.36 * b.speedAt(x) - w + b.rng.range(0.6, 1.1);
      return buildRock(b, end + gap, false);
    },
  },
  {
    id: 'logBranch',
    tags: ['log', 'branch'],
    weight: [0.6, 2, 2],
    build: (b, x) => buildBranch(b, combo(b, buildLog(b, x, false))),
  },
  {
    id: 'branchLog',
    tags: ['branch', 'log'],
    weight: [0.6, 2, 2],
    build: (b, x) => buildLog(b, combo(b, buildBranch(b, x, false)), false),
  },
  {
    id: 'thornsBranch',
    tags: ['thorns', 'branch'],
    weight: [0, 1.5, 2],
    build: (b, x) => buildBranch(b, combo(b, buildThorns(b, x, false)), false),
  },
  {
    id: 'gapLog',
    tags: ['gap', 'log'],
    weight: [0, 1.5, 2],
    build: (b, x) => buildLog(b, combo(b, buildGap(b, x, false), 1.1), false),
  },
  {
    id: 'mudRock',
    tags: ['mud', 'rock'],
    weight: [0, 1.2, 1.5],
    build: (b, x) => buildRock(b, combo(b, buildMud(b, x, false), 0.9), false),
  },
  {
    id: 'rootsSnare',
    tags: ['roots', 'snare'],
    weight: [0, 1, 1.5],
    build: (b, x) => buildSnare(b, combo(b, buildRoots(b, x))),
  },
  {
    id: 'branchBranch',
    tags: ['branch'],
    weight: [0, 0, 1.5],
    build: (b, x) => buildBranch(b, buildBranch(b, x, false) + b.rng.range(1.2, 1.8), false),
  },
  {
    id: 'stairs',
    tags: ['rock', 'log', 'trunk'],
    weight: [0, 0.6, 1.5],
    build: (b, x) => {
      const a = buildRock(b, x, false);
      const c = buildLog(b, combo(b, a, 0.85), false);
      return buildTrunk(b, combo(b, c, 0.85));
    },
  },
];

function patternWeight(p: Pattern, diff: DifficultyConfig, stage: StageConfig): number {
  const base = p.weight[diff.tier] ?? 0;
  if (base <= 0) return 0;
  let w = base;
  for (const tag of p.tags) w *= stage.bias[tag] ?? 1;
  return w;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateCourse(params: CourseParams): Course {
  if (params.tutorial) return generateTutorialCourse(params.seed);
  const diff = DIFFICULTIES[params.difficulty];
  const stage = STAGES[params.stage];
  const rng = new Rng((params.seed ^ 0x5eedf00d) >>> 0);
  const b = new CourseBuilder(rng, diff, stage);
  const weights = PATTERNS.map((p) => patternWeight(p, diff, stage));

  const length = diff.courseLength;
  let x = diff.tier === 0 ? 34 : 30;
  let previous = '';
  let repeat = 0;

  // Opening orb line teaches that orbs fuel the Fire Dash.
  b.line(12, 6, 2.2, 0.8);

  while (x < length + 60) {
    let pattern = rng.weighted(PATTERNS, weights);
    // Avoid long runs of the same pattern.
    if (pattern.id === previous && repeat >= 1) pattern = rng.weighted(PATTERNS, weights);
    repeat = pattern.id === previous ? repeat + 1 : 0;
    previous = pattern.id;

    const end = pattern.build(b, x);

    // Spacing in seconds of travel → metres at the expected speed.
    let gapSeconds = rng.range(diff.spacing[0], diff.spacing[1]);
    if (pattern.tags.includes('gap') || pattern.tags.includes('mud')) gapSeconds += 0.15;
    const spacing = b.meters(gapSeconds, end);
    let cursor = end + 3;
    const next = end + spacing;

    // Optional slope inside the spacing (never under an obstacle).
    if (spacing >= 15 && rng.chance(stage.slopeChance)) {
      const len = rng.range(8, Math.min(16, spacing - 7));
      const maxDh = Math.min(1.3, len * 0.11);
      let dh = rng.range(-maxDh, maxDh);
      if (Math.abs(b.h + dh) > stage.maxElevation) dh = -dh;
      if (Math.abs(b.h + dh) <= stage.maxElevation) {
        b.slope(cursor, len, dh);
        cursor += len + 1;
      }
    }

    // Orb trail on flat ground between hazards.
    if (next - cursor > 6 && rng.chance(0.45)) {
      const count = Math.min(6, Math.floor((next - cursor - 3) / 1.8));
      if (count >= 2) b.line(cursor + 0.5, count, 1.8, 0.8);
    }

    x = next;
  }

  // Power-up pickups at running / small-hop height, spread through the course.
  placePickups(b, 'shield', diff.pickups.shield, length, 1.0);
  placePickups(b, 'boost', diff.pickups.boost, length, 1.9);

  // One rare Ancient Dragon Scale on a demanding high route (needs a well-timed Forest Leap).
  const candidates = b.obstacles.filter(
    (o) =>
      (o.kind === 'trunk' || o.kind === 'log' || o.kind === 'gap' || o.kind === 'thorns') &&
      o.x > length * 0.4 &&
      o.x < length * 0.85,
  );
  if (candidates.length > 0) {
    const host = rng.pick(candidates);
    b.pending.push({ kind: 'scale', x: host.x + host.w / 2, yRel: 4.55 });
  }

  b.terrainX.push(length + 400);
  b.terrainH.push(b.h);

  return finalize(b, params, length, diff.startGap, rng);
}

function placePickups(
  b: CourseBuilder,
  kind: CollectibleKind,
  count: number,
  length: number,
  yRel: number,
): void {
  for (let i = 0; i < count; i++) {
    const target = length * (0.18 + (0.62 * (i + 0.5)) / count) + b.rng.range(-40, 40);
    const spot = findFreeSpot(b, target);
    if (spot !== null) b.collect(kind, spot, yRel);
  }
}

/** Find an x near `target` that is at least 4 m away from every obstacle region. */
function findFreeSpot(b: CourseBuilder, target: number): number | null {
  for (let offset = 0; offset < 80; offset += 1.5) {
    for (const candidate of [target + offset, target - offset]) {
      let free = true;
      for (const o of b.obstacles) {
        const left = o.kind === 'boulder' ? o.stopX : o.x;
        if (candidate > left - 4 && candidate < o.x + o.w + 4) {
          free = false;
          break;
        }
      }
      if (free) return candidate;
    }
  }
  return null;
}

function finalize(
  b: CourseBuilder,
  params: CourseParams,
  length: number,
  startGap: number,
  rng: Rng,
): Course {
  const obstacles = b.obstacles.sort((a, c) => a.x - c.x);
  obstacles.forEach((o, i) => (o.id = i));

  const course: Course = {
    seed: params.seed >>> 0,
    difficulty: params.difficulty,
    stage: params.stage,
    tutorial: Boolean(params.tutorial),
    length,
    startGap,
    obstacles,
    collectibles: [],
    terrainX: b.terrainX,
    terrainH: b.terrainH,
    pits: b.pits,
    hover: [],
    decorSeed: rng.nextU32(),
  };

  const collectibles = b.pending
    .filter((c) => !isOverPit(course, c.x) || c.yRel > 1.5)
    .map((c) => ({ id: 0, kind: c.kind, x: c.x, y: groundAt(course, c.x) + c.yRel }))
    .sort((a, c) => a.x - c.x);
  collectibles.forEach((c, i) => (c.id = i));
  course.collectibles = collectibles;

  const hoverRng = rng.fork(7);
  const seconds = Math.ceil(length / 6) + 30;
  for (let i = 0; i < seconds; i++) course.hover.push(hoverRng.range(2.5, 4.1));
  return course;
}

/** Ground height at x (m). Pits report the rim height; use `isOverPit` for support. */
export function groundAt(course: Course, x: number): number {
  const xs = course.terrainX;
  const hs = course.terrainH;
  if (x <= xs[0]!) return hs[0]!;
  let lo = 0;
  let hi = xs.length - 1;
  if (x >= xs[hi]!) return hs[hi]!;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const x0 = xs[lo]!;
  const x1 = xs[hi]!;
  const t = (x - x0) / (x1 - x0);
  return hs[lo]! + (hs[hi]! - hs[lo]!) * t;
}

/** True if a dragon centred at x has no ground under its support span. */
export function isOverPit(course: Course, x: number, footHalfWidth = 0.45): boolean {
  const p = course.pits;
  for (let i = 0; i < p.length; i += 2) {
    const x0 = p[i]!;
    if (x0 > x) return false;
    const x1 = p[i + 1]!;
    if (x - footHalfWidth >= x0 && x + footHalfWidth <= x1) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tutorial course
// ---------------------------------------------------------------------------

export type TutorialAction = 'jump' | 'slide' | 'dash' | 'leap' | 'run';

export interface TutorialLesson {
  id: string;
  /** Dragon x at which the lesson prompt appears (time freezes until the action). */
  x: number;
  action: TutorialAction;
  title: string;
  body: string;
}

export const TUTORIAL_LENGTH = 900;

export const TUTORIAL_LESSONS: readonly TutorialLesson[] = [
  {
    id: 'jump',
    x: 41.6,
    action: 'jump',
    title: 'Jump',
    body: 'A fallen log blocks the trail. Press Jump to leap over it.',
  },
  {
    id: 'slide',
    x: 80,
    action: 'slide',
    title: 'Slide',
    body: 'Low branch ahead! Press Slide to duck underneath.',
  },
  {
    id: 'dash',
    x: 116,
    action: 'dash',
    title: 'Fire Dash',
    body: 'Orbs charge your Fire Dash. Dash now to burn straight through the thorns.',
  },
  {
    id: 'leap',
    x: 159.4,
    action: 'leap',
    title: 'Forest Leap',
    body: 'Jump, then press Jump again in mid-air to beat your wings and reach the crystals.',
  },
  {
    id: 'gap',
    x: 209,
    action: 'jump',
    title: 'Broken bridge',
    body: 'Jump the gap. If you fall, your wings save you — but it costs a heart.',
  },
  {
    id: 'catch',
    x: 250,
    action: 'run',
    title: 'Catch the fireball',
    body: 'Clean runs build Flow and speed. Close the distance and catch the fireball!',
  },
];

export function generateTutorialCourse(seed = 1): Course {
  const diff = DIFFICULTIES.easy;
  const stage = STAGES.emerald;
  const rng = new Rng(seed >>> 0);
  const b = new CourseBuilder(rng, diff, stage);

  b.line(12, 5, 2, 0.8);
  b.obstacle('log', 44, 1.4, 0, 0.8);
  b.arc(40, 50, 2.5, 5);
  b.obstacle('branch', 84, 2.4, 1.0, 3.9);
  b.line(96, 6, 1.6, 0.8);
  b.obstacle('thorns', 124, 2.4, 0, 0.75);
  b.obstacle('log', 163, 1.3, 0, 0.8);
  b.collect('crystal', 162.5, 3.9);
  b.collect('crystal', 164.5, 4.3);
  b.collect('crystal', 166.5, 3.9);
  b.obstacle('gap', 212, 2.8, -12, 0);
  b.pits.push(212, 214.8);
  b.arc(209, 218, 2.3, 4);

  // Gentle finale: a few simple hazards while the fireball tires.
  let x = 262;
  const finale = ['rock', 'log', 'roots', 'log', 'rock', 'branch', 'log', 'rock', 'log', 'thorns'];
  for (let i = 0; i < 40; i++) {
    const kind = finale[i % finale.length]!;
    const end =
      kind === 'rock'
        ? buildRock(b, x)
        : kind === 'roots'
          ? buildRoots(b, x)
          : kind === 'branch'
            ? buildBranch(b, x)
            : kind === 'thorns'
              ? buildThorns(b, x)
              : buildLog(b, x);
    x = end + b.meters(2.4, end);
    if (x > TUTORIAL_LENGTH - 50) break;
  }
  b.terrainX.push(TUTORIAL_LENGTH + 400);
  b.terrainH.push(0);
  return finalize(
    b,
    { seed, difficulty: 'easy', stage: 'emerald', tutorial: true },
    TUTORIAL_LENGTH,
    24,
    rng,
  );
}
