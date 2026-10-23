/**
 * Achievement catalogue and evaluation. Evaluated on the server from verified
 * run results (and locally for offline play).
 */
import type { Difficulty } from '../sim/difficulty';
import type { RunResult } from '../sim/simulation';
import { STAGE_IDS, type StageId } from '../sim/stages';

export type AchievementIcon =
  | 'flame'
  | 'shield'
  | 'scale'
  | 'crystal'
  | 'crown'
  | 'leaf'
  | 'trophy'
  | 'team'
  | 'bolt'
  | 'compass'
  | 'thorn';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: AchievementIcon;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first-catch',
    name: 'First Catch',
    description: 'Catch the fireball for the first time.',
    icon: 'flame',
  },
  {
    id: 'wildwood-runner',
    name: 'Wildwood Runner',
    description: 'Catch the fireball on Wildwood Chase (Medium).',
    icon: 'leaf',
  },
  {
    id: 'dragons-trial',
    name: "Dragon's Trial",
    description: "Catch the fireball on Dragon's Trial (Hard).",
    icon: 'crown',
  },
  {
    id: 'untouchable',
    name: 'Untouchable',
    description: 'Catch the fireball without taking a single hit.',
    icon: 'shield',
  },
  {
    id: 'blazing-pursuit',
    name: 'Blazing Pursuit',
    description: 'Catch the fireball in under 75 seconds on Medium or Hard.',
    icon: 'bolt',
  },
  {
    id: 'flow-state',
    name: 'Flow State',
    description: 'Reach maximum Flow during a run.',
    icon: 'flame',
  },
  {
    id: 'scale-seeker',
    name: 'Scale Seeker',
    description: 'Find an Ancient Dragon Scale.',
    icon: 'scale',
  },
  {
    id: 'scale-collector',
    name: 'Scale Collector',
    description: 'Find three Ancient Dragon Scales.',
    icon: 'scale',
  },
  {
    id: 'crystal-hoarder',
    name: 'Crystal Hoarder',
    description: 'Collect 500 forest crystals in total.',
    icon: 'crystal',
  },
  {
    id: 'thorn-burner',
    name: 'Thorn Burner',
    description: 'Burn through 25 thorn bushes with Fire Dash.',
    icon: 'thorn',
  },
  {
    id: 'explorer',
    name: 'Explorer of the Wilds',
    description: 'Catch the fireball in all three forests.',
    icon: 'compass',
  },
  {
    id: 'team-spirit',
    name: 'Team Spirit',
    description: 'Finish a live race against other dragons.',
    icon: 'team',
  },
  {
    id: 'race-champion',
    name: 'Race Champion',
    description: 'Win a live race against at least one other dragon.',
    icon: 'trophy',
  },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export interface LifetimeStats {
  runs: number;
  catches: number;
  catchesByDifficulty: Record<Difficulty, number>;
  catchesByStage: Record<StageId, number>;
  crystalsCollected: number;
  scalesFound: number;
  thornsBurned: number;
  races: number;
  raceWins: number;
}

export function emptyLifetimeStats(): LifetimeStats {
  return {
    runs: 0,
    catches: 0,
    catchesByDifficulty: { easy: 0, medium: 0, hard: 0 },
    catchesByStage: { emerald: 0, mistpine: 0, moonlit: 0 },
    crystalsCollected: 0,
    scalesFound: 0,
    thornsBurned: 0,
    races: 0,
    raceWins: 0,
  };
}

/** Fold a verified run into lifetime stats (returns a new object). */
export function applyRunToStats(
  stats: LifetimeStats,
  run: { result: RunResult; difficulty: Difficulty; stage: StageId },
): LifetimeStats {
  const caught = run.result.outcome === 'caught';
  return {
    ...stats,
    runs: stats.runs + 1,
    catches: stats.catches + (caught ? 1 : 0),
    catchesByDifficulty: {
      ...stats.catchesByDifficulty,
      [run.difficulty]: stats.catchesByDifficulty[run.difficulty] + (caught ? 1 : 0),
    },
    catchesByStage: {
      ...stats.catchesByStage,
      [run.stage]: stats.catchesByStage[run.stage] + (caught ? 1 : 0),
    },
    crystalsCollected: stats.crystalsCollected + run.result.crystals,
    scalesFound: stats.scalesFound + run.result.scales,
    thornsBurned: stats.thornsBurned + run.result.thornsBurned,
  };
}

export interface AchievementContext {
  /** Lifetime stats *after* applying the current run/race. */
  stats: LifetimeStats;
  run?: { result: RunResult; difficulty: Difficulty; stage: StageId };
  race?: { placement: number; players: number };
}

/** Returns ids of achievements newly earned in this context. */
export function evaluateAchievements(
  ctx: AchievementContext,
  unlocked: ReadonlySet<string>,
): string[] {
  const earned: string[] = [];
  const grant = (id: string, condition: boolean) => {
    if (condition && !unlocked.has(id) && !earned.includes(id)) earned.push(id);
  };
  const s = ctx.stats;
  grant('first-catch', s.catches >= 1);
  grant('wildwood-runner', s.catchesByDifficulty.medium >= 1);
  grant('dragons-trial', s.catchesByDifficulty.hard >= 1);
  grant('scale-seeker', s.scalesFound >= 1);
  grant('scale-collector', s.scalesFound >= 3);
  grant('crystal-hoarder', s.crystalsCollected >= 500);
  grant('thorn-burner', s.thornsBurned >= 25);
  grant(
    'explorer',
    STAGE_IDS.every((id) => s.catchesByStage[id] >= 1),
  );
  if (ctx.run) {
    const r = ctx.run.result;
    const caught = r.outcome === 'caught';
    grant('untouchable', caught && r.hits === 0 && r.pitFalls === 0);
    grant('blazing-pursuit', caught && ctx.run.difficulty !== 'easy' && r.seconds < 75);
    grant('flow-state', r.maxFlow >= 10);
  }
  if (ctx.race) {
    grant('team-spirit', ctx.race.players >= 2);
    grant('race-champion', ctx.race.players >= 2 && ctx.race.placement === 1);
  }
  return earned;
}
