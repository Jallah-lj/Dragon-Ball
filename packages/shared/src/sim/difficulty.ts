/**
 * DifficultyManager data: the three launch difficulties.
 *
 * Difficulty comes from speed, obstacle density, reaction windows and the
 * fireball's pace — never from unpredictable collisions.
 */

export const DIFFICULTY_IDS = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTY_IDS)[number];

export interface DifficultyConfig {
  id: Difficulty;
  name: string;
  tagline: string;
  /** Dragon cruising speed with zero flow (m/s). */
  baseSpeed: number;
  /** Speed ramps up by `rampPerSecond` per simulated second, capped at `rampMax`. */
  rampPerSecond: number;
  rampMax: number;
  /** Fireball pace as a multiple of the dragon's base speed (before rubber-banding). */
  fireballFactor: number;
  /** Initial distance between dragon and fireball (m). */
  startGap: number;
  /** Distance at which the fireball reaches the Ember Shrine and escapes (m). */
  courseLength: number;
  hearts: number;
  /** Seconds of travel between obstacle patterns, [min, max]. */
  spacing: readonly [number, number];
  /** Seconds of travel between the parts of a combo pattern. */
  comboSpacing: number;
  /** Highest obstacle-pattern tier that can appear. */
  tier: 0 | 1 | 2;
  scoreMultiplier: number;
  /** Catching faster than par earns a time bonus. */
  parSeconds: number;
  /** Crystals awarded for catching the fireball. */
  catchCrystals: number;
  /** XP multiplier. */
  xpMultiplier: number;
  pickups: { shield: number; boost: number };
  /** Boulder roll speed toward the dragon (m/s). */
  boulderSpeed: number;
  /** Swing period in ticks. */
  swingPeriod: number;
  /** Snare period in ticks. */
  snarePeriod: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: {
    id: 'easy',
    name: 'Forest Explorer',
    tagline: 'A gentle chase with wide reaction windows. Learn the trail.',
    baseSpeed: 8.6,
    rampPerSecond: 0.0006,
    rampMax: 0.06,
    fireballFactor: 1.04,
    startGap: 50,
    courseLength: 1500,
    hearts: 4,
    spacing: [2.0, 3.0],
    comboSpacing: 1.25,
    tier: 0,
    scoreMultiplier: 1,
    parSeconds: 75,
    catchCrystals: 10,
    xpMultiplier: 1,
    pickups: { shield: 2, boost: 2 },
    boulderSpeed: 2.5,
    swingPeriod: 168,
    snarePeriod: 150,
  },
  medium: {
    id: 'medium',
    name: 'Wildwood Chase',
    tagline: 'Mixed hazards and tighter timing. The true chase begins.',
    baseSpeed: 10.4,
    rampPerSecond: 0.0008,
    rampMax: 0.08,
    fireballFactor: 1.07,
    startGap: 70,
    courseLength: 2400,
    hearts: 3,
    spacing: [1.35, 2.2],
    comboSpacing: 0.95,
    tier: 1,
    scoreMultiplier: 1.5,
    parSeconds: 90,
    catchCrystals: 20,
    xpMultiplier: 1.4,
    pickups: { shield: 1, boost: 2 },
    boulderSpeed: 3.5,
    swingPeriod: 150,
    snarePeriod: 132,
  },
  hard: {
    id: 'hard',
    name: "Dragon's Trial",
    tagline: 'Relentless sequences and narrow windows. Only masters catch the flame.',
    baseSpeed: 12.2,
    rampPerSecond: 0.0009,
    rampMax: 0.09,
    fireballFactor: 1.085,
    startGap: 84,
    courseLength: 3200,
    hearts: 3,
    spacing: [0.95, 1.6],
    comboSpacing: 0.85,
    tier: 2,
    scoreMultiplier: 2,
    parSeconds: 105,
    catchCrystals: 35,
    xpMultiplier: 1.9,
    pickups: { shield: 1, boost: 1 },
    boulderSpeed: 4.5,
    swingPeriod: 132,
    snarePeriod: 120,
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTY_IDS as readonly string[]).includes(value);
}
