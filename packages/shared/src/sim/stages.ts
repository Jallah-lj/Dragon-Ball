/**
 * Forest stages (biomes). Each stage shares the same simulation rules but has
 * its own obstacle mix, terrain character and visual identity.
 */

export const STAGE_IDS = ['emerald', 'mistpine', 'moonlit'] as const;
export type StageId = (typeof STAGE_IDS)[number];

export interface StageConfig {
  id: StageId;
  name: string;
  description: string;
  order: number;
  /** Probability of a slope between patterns. */
  slopeChance: number;
  /** Max absolute terrain elevation (m). */
  maxElevation: number;
  /** Multipliers applied to pattern weights by tag. */
  bias: Partial<Record<string, number>>;
  /** Catch the fireball in this stage to unlock the next. */
  unlockAfter: StageId | null;
}

export const STAGES: Record<StageId, StageConfig> = {
  emerald: {
    id: 'emerald',
    name: 'Emerald Woodland',
    description: 'Sunlit oaks, ferns and mossy logs. The fireball first slips away here.',
    order: 0,
    slopeChance: 0.35,
    maxElevation: 1.6,
    bias: { log: 1.3, branch: 1.2 },
    unlockAfter: null,
  },
  mistpine: {
    id: 'mistpine',
    name: 'Misty Pine Forest',
    description: 'Fog-wrapped pines, broken bridges over ravines and swinging vines.',
    order: 1,
    slopeChance: 0.5,
    maxElevation: 2.2,
    bias: { gap: 1.6, swing: 1.5, boulder: 1.3, mud: 0.7 },
    unlockAfter: 'emerald',
  },
  moonlit: {
    id: 'moonlit',
    name: 'Moonlit Grove',
    description: 'An ancient grove where fireflies drift and wisp snares wake at night.',
    order: 2,
    slopeChance: 0.4,
    maxElevation: 1.8,
    bias: { snare: 2.2, roots: 1.4, thorns: 1.2 },
    unlockAfter: 'mistpine',
  },
};

export function isStageId(value: unknown): value is StageId {
  return typeof value === 'string' && (STAGE_IDS as readonly string[]).includes(value);
}
