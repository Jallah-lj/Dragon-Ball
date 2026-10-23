/**
 * HTTP API response shapes (DTOs). Public DTOs never contain email addresses,
 * password hashes, session data or internal ids of other players' accounts
 * beyond what is needed for display.
 */
import type { LifetimeStats } from '../meta/achievements';
import type { ProgressRecord, Unlocks } from '../meta/progression';
import type { Difficulty } from '../sim/difficulty';
import type { AbilityLoadout, Outcome, RunResult } from '../sim/simulation';
import type { StageId } from '../sim/stages';

export type TeamRole = 'owner' | 'captain' | 'member';
export type RunMode = 'solo' | 'daily';

export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'CSRF',
  'GUEST_NOT_ALLOWED',
  'TEAM_FULL',
  'INVITE_EXPIRED',
  'INVITE_INVALID',
  'ALREADY_IN_TEAM',
  'NOT_IN_TEAM',
  'OWNER_MUST_TRANSFER',
  'RUN_EXPIRED',
  'RUN_ALREADY_SUBMITTED',
  'RUN_INVALID',
  'RUN_LOCKED',
  'INSUFFICIENT_CRYSTALS',
  'EMAIL_NOT_CONFIGURED',
  'RACE_NOT_FOUND',
  'RACE_FULL',
  'RACE_STARTED',
  'RACE_EXPIRED',
  'INTERNAL',
  'SERVICE_UNAVAILABLE',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export interface TeamMembershipDTO {
  id: string;
  name: string;
  tag: string;
  role: TeamRole;
}

export interface SessionUserDTO {
  id: string;
  username: string | null;
  displayName: string;
  isGuest: boolean;
  email: string | null;
  emailVerified: boolean;
  avatar: string;
  selectedSkin: string;
  xp: number;
  level: number;
  crystals: number;
  createdAt: string;
  team: TeamMembershipDTO | null;
}

export interface AuthResponseDTO {
  user: SessionUserDTO;
  csrfToken: string;
  /**
   * Session token for cookie-less clients. Only present when the request sent
   * `x-auth-mode: token` (the browser refused cookies, e.g. in an embedded frame).
   */
  sessionToken?: string;
}

export interface ProgressDTO {
  records: ProgressRecord[];
  unlocks: Unlocks;
  stats: LifetimeStats;
}

export interface RecentRunDTO {
  id: string;
  mode: RunMode | 'race';
  difficulty: Difficulty;
  stage: StageId;
  outcome: Outcome;
  score: number;
  ticks: number;
  finishedAt: string;
}

export interface ProfileDTO {
  user: SessionUserDTO;
  progress: ProgressDTO;
  achievements: { id: string; unlockedAt: string }[];
  recentRuns: RecentRunDTO[];
  bestScores: Record<Difficulty, number>;
}

export interface RunTicketDTO {
  runId: string;
  seed: number;
  mode: RunMode;
  difficulty: Difficulty;
  stage: StageId;
  abilities: AbilityLoadout;
  ranked: boolean;
  expiresAt: string;
}

export interface RunCompletionDTO {
  result: RunResult;
  ranked: boolean;
  /** True if the client's claimed result differed from the verified replay. */
  mismatch: boolean;
  xpGained: number;
  crystalsGained: number;
  newAchievements: string[];
  personalBest: boolean;
  rank: { weekly: number | null; allTime: number | null };
  level: number;
  leveledUp: boolean;
  unlocks: Unlocks;
}

export interface LeaderboardEntryDTO {
  rank: number;
  userId: string;
  displayName: string;
  avatar: string;
  level: number;
  team: { tag: string; name: string } | null;
  score: number;
  ticks: number;
  stage: StageId;
  achievedAt: string;
}

export interface LeaderboardPageDTO {
  difficulty: Difficulty;
  period: 'daily' | 'weekly' | 'all';
  periodKey: string;
  page: number;
  pageSize: number;
  total: number;
  entries: LeaderboardEntryDTO[];
  you: LeaderboardEntryDTO | null;
}

export interface TeamLeaderboardEntryDTO {
  rank: number;
  teamId: string;
  name: string;
  tag: string;
  memberCount: number;
  points: number;
  races: number;
  wins: number;
}

export interface TeamLeaderboardPageDTO {
  period: 'weekly' | 'all';
  periodKey: string;
  page: number;
  pageSize: number;
  total: number;
  entries: TeamLeaderboardEntryDTO[];
}

export interface TeamMemberDTO {
  userId: string;
  displayName: string;
  avatar: string;
  level: number;
  role: TeamRole;
  joinedAt: string;
  bestScore: number;
  racePoints: number;
}

export interface TeamInviteDTO {
  code: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
  createdBy: string;
  revoked: boolean;
}

export interface TeamDTO {
  id: string;
  name: string;
  tag: string;
  description: string;
  memberCount: number;
  maxMembers: number;
  createdAt: string;
  stats: {
    weeklyPoints: number;
    allTimePoints: number;
    races: number;
    wins: number;
    bestScore: number;
  };
  members: TeamMemberDTO[];
  yourRole: TeamRole | null;
  /** Only present for owners and captains. */
  invites?: TeamInviteDTO[];
}

export type InviteStatus = 'valid' | 'expired' | 'full' | 'revoked' | 'exhausted';

export interface InvitePreviewDTO {
  code: string;
  status: InviteStatus;
  expiresAt: string;
  team: { name: string; tag: string; memberCount: number; maxMembers: number; description: string };
}

export interface CollectionSkinDTO {
  id: string;
  owned: boolean;
  equipped: boolean;
  price: number | null;
  requirement: string | null;
}

export interface CollectionDTO {
  crystals: number;
  selectedSkin: string;
  avatar: string;
  skins: CollectionSkinDTO[];
  achievements: { id: string; unlocked: boolean; unlockedAt: string | null }[];
}

export interface SessionInfoDTO {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
}

export interface HealthDTO {
  ok: boolean;
  db: boolean;
  redis: boolean | null;
  version: string;
  uptimeSeconds: number;
  features: { email: boolean; redis: boolean };
}

export interface ConfigDTO {
  emailEnabled: boolean;
  raceMinPlayers: number;
  raceMaxPlayers: number;
}

/** Public player profile — display data only (no email, no account details). */
export interface PublicProfileDTO {
  id: string;
  displayName: string;
  avatar: string;
  level: number;
  joinedAt: string;
  team: { id: string; name: string; tag: string } | null;
  achievements: { id: string; unlockedAt: string }[];
  bestScores: Record<Difficulty, number>;
  catches: number;
  races: number;
  raceWins: number;
}
