/**
 * Database schema (PostgreSQL via Drizzle ORM). Migrations in ../../drizzle
 * are generated from this file with `npm run db:generate`.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username'),
    displayName: text('display_name').notNull(),
    email: text('email'),
    emailVerifiedAt: ts('email_verified_at'),
    passwordHash: text('password_hash'),
    isGuest: boolean('is_guest').notNull().default(false),
    avatar: text('avatar').notNull().default('emberscale'),
    selectedSkin: text('selected_skin').notNull().default('emberscale'),
    xp: integer('xp').notNull().default(0),
    crystals: integer('crystals').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_username_lower_idx').on(sql`lower(${t.username})`),
    uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`),
    index('users_guest_created_idx').on(t.isGuest, t.createdAt),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
);

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: ['verify', 'reset'] }).notNull(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
  },
  (t) => [
    uniqueIndex('email_tokens_hash_idx').on(t.tokenHash),
    index('email_tokens_user_idx').on(t.userId, t.purpose),
  ],
);

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mode: text('mode', { enum: ['solo', 'daily', 'race'] }).notNull(),
    difficulty: text('difficulty', { enum: ['easy', 'medium', 'hard'] }).notNull(),
    stage: text('stage', { enum: ['emerald', 'mistpine', 'moonlit'] }).notNull(),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    abilities: jsonb('abilities')
      .$type<{ dash: boolean; leap: boolean; shield: boolean }>()
      .notNull(),
    status: text('status', { enum: ['active', 'completed', 'invalid'] })
      .notNull()
      .default('active'),
    ranked: boolean('ranked').notNull().default(false),
    raceCode: text('race_code'),
    dayKey: text('day_key'),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    completedAt: ts('completed_at'),
    outcome: text('outcome', { enum: ['caught', 'escaped', 'defeated'] }),
    score: integer('score'),
    ticks: integer('ticks'),
    distance: integer('distance'),
    stats: jsonb('stats').$type<Record<string, number>>(),
    inputCount: integer('input_count'),
    invalidReason: text('invalid_reason'),
  },
  (t) => [
    index('runs_user_created_idx').on(t.userId, t.createdAt),
    index('runs_status_expires_idx').on(t.status, t.expiresAt),
    index('runs_race_idx').on(t.raceCode),
  ],
);

export const progress = pgTable(
  'progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    difficulty: text('difficulty', { enum: ['easy', 'medium', 'hard'] }).notNull(),
    stage: text('stage', { enum: ['emerald', 'mistpine', 'moonlit'] }).notNull(),
    catches: integer('catches').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    bestScore: integer('best_score').notNull().default(0),
    bestTicks: integer('best_ticks'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.difficulty, t.stage] })],
);

export const userStats = pgTable('user_stats', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  stats: jsonb('stats').$type<Record<string, unknown>>().notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const achievements = pgTable(
  'achievements',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    achievementId: text('achievement_id').notNull(),
    unlockedAt: ts('unlocked_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementId] })],
);

export const userSkins = pgTable(
  'user_skins',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skinId: text('skin_id').notNull(),
    acquiredAt: ts('acquired_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.skinId] })],
);

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** Best verified score per player, per period ('all', '2026-W43', 'daily:2026-10-23') and difficulty. */
export const leaderboardEntries = pgTable(
  'leaderboard_entries',
  {
    periodKey: text('period_key').notNull(),
    difficulty: text('difficulty', { enum: ['easy', 'medium', 'hard'] }).notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    ticks: integer('ticks').notNull(),
    stage: text('stage', { enum: ['emerald', 'mistpine', 'moonlit'] }).notNull(),
    runId: uuid('run_id').references(() => runs.id, { onDelete: 'set null' }),
    achievedAt: ts('achieved_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.periodKey, t.difficulty, t.userId] }),
    index('leaderboard_rank_idx').on(
      t.periodKey,
      t.difficulty,
      t.score.desc(),
      t.ticks,
      t.achievedAt,
    ),
  ],
);

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    tag: text('tag').notNull(),
    description: text('description').notNull().default(''),
    maxMembers: integer('max_members').notNull().default(8),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('teams_name_lower_idx').on(sql`lower(${t.name})`),
    uniqueIndex('teams_tag_idx').on(t.tag),
  ],
);

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'captain', 'member'] }).notNull(),
    joinedAt: ts('joined_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.userId] }),
    uniqueIndex('team_members_user_idx').on(t.userId),
    index('team_members_team_idx').on(t.teamId, t.role),
  ],
);

export const teamInvites = pgTable(
  'team_invites',
  {
    code: text('code').primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    maxUses: integer('max_uses').notNull(),
    uses: integer('uses').notNull().default(0),
    revokedAt: ts('revoked_at'),
  },
  (t) => [index('team_invites_team_idx').on(t.teamId)],
);

export const teamLeaderboardEntries = pgTable(
  'team_leaderboard_entries',
  {
    periodKey: text('period_key').notNull(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    points: integer('points').notNull().default(0),
    races: integer('races').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.periodKey, t.teamId] }),
    index('team_leaderboard_rank_idx').on(t.periodKey, t.points.desc()),
  ],
);

export const raceResults = pgTable(
  'race_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    raceCode: text('race_code').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    runId: uuid('run_id').references(() => runs.id, { onDelete: 'set null' }),
    placement: integer('placement').notNull(),
    points: integer('points').notNull(),
    players: integer('players').notNull(),
    outcome: text('outcome', { enum: ['caught', 'escaped', 'defeated'] }),
    score: integer('score').notNull(),
    ticks: integer('ticks').notNull(),
    dnf: boolean('dnf').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('race_results_code_idx').on(t.raceCode),
    index('race_results_user_idx').on(t.userId, t.createdAt),
  ],
);

export const schema = {
  users,
  sessions,
  emailTokens,
  runs,
  progress,
  userStats,
  achievements,
  userSkins,
  userSettings,
  leaderboardEntries,
  teams,
  teamMembers,
  teamInvites,
  teamLeaderboardEntries,
  raceResults,
};
