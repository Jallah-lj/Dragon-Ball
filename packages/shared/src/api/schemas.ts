/**
 * Request validation schemas (zod), shared by the server (enforcement) and the
 * web client (form validation with identical rules).
 */
import { z } from 'zod';
import { MAX_INPUT_EVENTS, MAX_RUN_TICKS } from '../sim/constants';
import { DIFFICULTY_IDS } from '../sim/difficulty';
import { STAGE_IDS } from '../sim/stages';
import { SKIN_IDS } from '../meta/cosmetics';

/** Collapse whitespace and strip control characters. */
// Control characters, zero-width characters and bidi overrides (used for spoofing).
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g;

export function normalizeText(value: string): string {
  return value.normalize('NFKC').replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim();
}

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(20, 'Username must be at most 20 characters.')
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'Use letters, numbers, "_" or "-", starting with a letter.');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email.'))
  .pipe(z.string().max(254));

export const displayNameSchema = z
  .string()
  .transform(normalizeText)
  .pipe(
    z
      .string()
      .min(2, 'Display name must be at least 2 characters.')
      .max(24, 'Display name must be at most 24 characters.')
      .regex(/^[\p{L}\p{N} _.'-]+$/u, 'Display name contains unsupported characters.'),
  );

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  email: emailSchema.optional(),
  displayName: displayNameSchema.optional(),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username or email.').max(254),
  password: z.string().min(1, 'Enter your password.').max(128),
});

export const guestSchema = z.object({
  displayName: displayNameSchema.optional(),
});

export const upgradeGuestSchema = registerSchema;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });

export const deleteAccountSchema = z.object({
  password: z.string().max(128).optional(),
  confirm: z.literal('DELETE', { message: 'Type DELETE to confirm.' }),
});

export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    avatar: z.enum(SKIN_IDS as [string, ...string[]]).optional(),
    email: emailSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');

export const equipSkinSchema = z.object({ skinId: z.enum(SKIN_IDS as [string, ...string[]]) });
export const purchaseSkinSchema = equipSkinSchema;

export const runModeSchema = z.enum(['solo', 'daily']);

export const createRunSchema = z.object({
  mode: runModeSchema.default('solo'),
  difficulty: z.enum(DIFFICULTY_IDS),
  stage: z.enum(STAGE_IDS),
});

export const claimedResultSchema = z.object({
  score: z.number().int().min(0).max(10_000_000),
  ticks: z.number().int().min(0).max(MAX_RUN_TICKS),
  outcome: z.enum(['caught', 'escaped', 'defeated']),
});

export const completeRunSchema = z.object({
  inputs: z.array(z.number().int().min(0).max(MAX_RUN_TICKS)).max(MAX_INPUT_EVENTS * 2),
  claimed: claimedResultSchema,
});

export const teamNameSchema = z
  .string()
  .transform(normalizeText)
  .pipe(
    z
      .string()
      .min(3, 'Team name must be at least 3 characters.')
      .max(32, 'Team name must be at most 32 characters.')
      .regex(/^[\p{L}\p{N} _.'&-]+$/u, 'Team name contains unsupported characters.'),
  );

export const teamTagSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,5}$/, 'Tag must be 2–5 letters or digits.');

export const teamDescriptionSchema = z
  .string()
  .transform(normalizeText)
  .pipe(z.string().max(200, 'Description must be at most 200 characters.'));

export const createTeamSchema = z.object({
  name: teamNameSchema,
  tag: teamTagSchema,
  description: teamDescriptionSchema.optional(),
});

export const TEAM_MIN_SIZE = 2;
export const TEAM_MAX_SIZE = 12;
export const TEAM_DEFAULT_SIZE = 8;

export const updateTeamSchema = z
  .object({
    name: teamNameSchema.optional(),
    description: teamDescriptionSchema.optional(),
    maxMembers: z.number().int().min(TEAM_MIN_SIZE).max(TEAM_MAX_SIZE).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');

export const createInviteSchema = z.object({
  expiresInHours: z.number().int().min(1).max(168).default(72),
  maxUses: z.number().int().min(1).max(50).default(10),
});

export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{8}$/, 'Invite codes are 8 characters.');

export const updateMemberSchema = z.object({ role: z.enum(['owner', 'captain', 'member']) });

export const LEADERBOARD_PAGE_SIZE = 20;

export const leaderboardQuerySchema = z.object({
  difficulty: z.enum(DIFFICULTY_IDS).default('medium'),
  period: z.enum(['daily', 'weekly', 'all']).default('weekly'),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export const teamLeaderboardQuerySchema = z.object({
  period: z.enum(['weekly', 'all']).default('weekly'),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export const raceCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/, 'Race codes are 6 characters.');

export const createRaceSchema = z.object({
  difficulty: z.enum(DIFFICULTY_IDS),
  stage: z.enum(STAGE_IDS),
  visibility: z.enum(['open', 'team']).default('open'),
});

export const raceProgressSchema = z.object({
  tick: z.number().int().min(0).max(MAX_RUN_TICKS),
  x: z.number().finite().min(-10).max(10_000),
  y: z.number().finite().min(-20).max(50),
  gap: z.number().finite().min(-10).max(1_000),
  hearts: z.number().int().min(0).max(10),
  flags: z.number().int().min(0).max(255),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateRunInput = z.infer<typeof createRunSchema>;
export type CompleteRunInput = z.infer<typeof completeRunSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type CreateRaceInput = z.infer<typeof createRaceSchema>;
export type RaceProgressInput = z.infer<typeof raceProgressSchema>;
