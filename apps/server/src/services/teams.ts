import { and, asc, count, eq, gt, inArray, isNull, max, sql, sum } from 'drizzle-orm';
import {
  levelForXp,
  weekKey,
  type CreateInviteInput,
  type CreateTeamInput,
  type InvitePreviewDTO,
  type InviteStatus,
  type TeamDTO,
  type TeamInviteDTO,
  type TeamRole,
  type UpdateTeamInput,
} from '@dbfc/shared';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import {
  leaderboardEntries,
  raceResults,
  teamInvites,
  teamLeaderboardEntries,
  teamMembers,
  teams,
  users,
} from '../db/schema';
import { randomCode } from '../lib/crypto';
import { AppError, forbidden, notFound } from '../lib/errors';
import type { UserRow } from './users';

const MAX_ACTIVE_INVITES = 10;

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

export async function roleIn(db: Db, teamId: string, userId: string): Promise<TeamRole | null> {
  const rows = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);
  return rows[0]?.role ?? null;
}

export async function teamOf(
  db: Db,
  userId: string,
): Promise<{ teamId: string; role: TeamRole } | null> {
  const rows = await db
    .select({ teamId: teamMembers.teamId, role: teamMembers.role })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

async function loadTeam(db: Db, teamId: string) {
  const rows = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!rows[0]) throw notFound('Team');
  return rows[0];
}

export async function teamDTO(db: Db, teamId: string, viewer: UserRow | null): Promise<TeamDTO> {
  const team = await loadTeam(db, teamId);
  const memberRows = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      avatar: users.avatar,
      xp: users.xp,
      role: teamMembers.role,
      joinedAt: teamMembers.joinedAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(asc(teamMembers.joinedAt));
  const ids = memberRows.map((m) => m.userId);
  const bests = ids.length
    ? await db
        .select({ userId: leaderboardEntries.userId, best: max(leaderboardEntries.score) })
        .from(leaderboardEntries)
        .where(
          and(eq(leaderboardEntries.periodKey, 'all'), inArray(leaderboardEntries.userId, ids)),
        )
        .groupBy(leaderboardEntries.userId)
    : [];
  const racePts = ids.length
    ? await db
        .select({ userId: raceResults.userId, points: sum(raceResults.points) })
        .from(raceResults)
        .where(and(eq(raceResults.teamId, teamId), inArray(raceResults.userId, ids)))
        .groupBy(raceResults.userId)
    : [];
  const boards = await db
    .select()
    .from(teamLeaderboardEntries)
    .where(
      and(
        eq(teamLeaderboardEntries.teamId, teamId),
        inArray(teamLeaderboardEntries.periodKey, ['all', weekKey()]),
      ),
    );
  const weekly = boards.find((b) => b.periodKey !== 'all');
  const allTime = boards.find((b) => b.periodKey === 'all');
  const bestBy = new Map(bests.map((b) => [b.userId, Number(b.best ?? 0)]));
  const ptsBy = new Map(racePts.map((r) => [r.userId, Number(r.points ?? 0)]));
  const members = memberRows.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    avatar: m.avatar,
    level: levelForXp(m.xp).level,
    role: m.role,
    joinedAt: m.joinedAt.toISOString(),
    bestScore: bestBy.get(m.userId) ?? 0,
    racePoints: ptsBy.get(m.userId) ?? 0,
  }));
  const yourRole = viewer ? (members.find((m) => m.userId === viewer.id)?.role ?? null) : null;
  const dto: TeamDTO = {
    id: team.id,
    name: team.name,
    tag: team.tag,
    description: team.description,
    memberCount: members.length,
    maxMembers: team.maxMembers,
    createdAt: team.createdAt.toISOString(),
    stats: {
      weeklyPoints: weekly?.points ?? 0,
      allTimePoints: allTime?.points ?? 0,
      races: allTime?.races ?? 0,
      wins: allTime?.wins ?? 0,
      bestScore: Math.max(0, ...members.map((m) => m.bestScore)),
    },
    members,
    yourRole,
  };
  if (yourRole === 'owner' || yourRole === 'captain') dto.invites = await activeInvites(db, teamId);
  return dto;
}

async function activeInvites(db: Db, teamId: string): Promise<TeamInviteDTO[]> {
  const rows = await db
    .select({ invite: teamInvites, creator: users.displayName })
    .from(teamInvites)
    .leftJoin(users, eq(users.id, teamInvites.createdBy))
    .where(
      and(
        eq(teamInvites.teamId, teamId),
        isNull(teamInvites.revokedAt),
        gt(teamInvites.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(teamInvites.createdAt));
  return rows
    .filter((r) => r.invite.uses < r.invite.maxUses)
    .map((r) => ({
      code: r.invite.code,
      createdAt: r.invite.createdAt.toISOString(),
      expiresAt: r.invite.expiresAt.toISOString(),
      maxUses: r.invite.maxUses,
      uses: r.invite.uses,
      createdBy: r.creator ?? 'Former member',
      revoked: false,
    }));
}

export async function createTeam(
  ctx: AppContext,
  user: UserRow,
  input: CreateTeamInput,
): Promise<string> {
  try {
    return await ctx.db.transaction(async (tx) => {
      if (await teamOf(tx as unknown as Db, user.id))
        throw new AppError('ALREADY_IN_TEAM', 'Leave your current team before creating a new one.');
      const nameTaken = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(sql`lower(${teams.name}) = ${input.name.toLowerCase()}`)
        .limit(1);
      if (nameTaken.length)
        throw new AppError('CONFLICT', 'That team name is already taken.', {
          fieldErrors: { name: ['That team name is already taken.'] },
        });
      const tagTaken = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.tag, input.tag))
        .limit(1);
      if (tagTaken.length)
        throw new AppError('CONFLICT', 'That team tag is already taken.', {
          fieldErrors: { tag: ['That team tag is already taken.'] },
        });
      const [team] = await tx
        .insert(teams)
        .values({ name: input.name, tag: input.tag, description: input.description ?? '' })
        .returning({ id: teams.id });
      await tx.insert(teamMembers).values({ teamId: team!.id, userId: user.id, role: 'owner' });
      return team!.id;
    });
  } catch (err) {
    if (isUniqueViolation(err))
      throw new AppError('CONFLICT', 'That team name or tag is already taken.');
    throw err;
  }
}

export async function updateTeam(
  ctx: AppContext,
  user: UserRow,
  teamId: string,
  input: UpdateTeamInput,
): Promise<void> {
  const role = await roleIn(ctx.db, teamId, user.id);
  if (role !== 'owner' && role !== 'captain')
    throw forbidden('Only the owner or a captain can edit the team.');
  if (input.maxMembers !== undefined && role !== 'owner')
    throw forbidden('Only the owner can change the team size.');
  try {
    await ctx.db.transaction(async (tx) => {
      await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).for('update');
      if (input.maxMembers !== undefined) {
        const [row] = await tx
          .select({ n: count() })
          .from(teamMembers)
          .where(eq(teamMembers.teamId, teamId));
        if (Number(row?.n ?? 0) > input.maxMembers) {
          throw new AppError('CONFLICT', 'The team already has more members than that.', {
            fieldErrors: { maxMembers: ['Remove members first.'] },
          });
        }
      }
      if (input.name) {
        const taken = await tx
          .select({ id: teams.id })
          .from(teams)
          .where(
            sql`lower(${teams.name}) = ${input.name.toLowerCase()} and ${teams.id} <> ${teamId}`,
          )
          .limit(1);
        if (taken.length)
          throw new AppError('CONFLICT', 'That team name is already taken.', {
            fieldErrors: { name: ['That team name is already taken.'] },
          });
      }
      await tx
        .update(teams)
        .set({
          ...(input.name ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.maxMembers !== undefined ? { maxMembers: input.maxMembers } : {}),
        })
        .where(eq(teams.id, teamId));
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'That team name is already taken.');
    throw err;
  }
}

export async function disbandTeam(ctx: AppContext, user: UserRow, teamId: string): Promise<void> {
  const role = await roleIn(ctx.db, teamId, user.id);
  if (role !== 'owner') throw forbidden('Only the owner can disband the team.');
  await ctx.db.delete(teams).where(eq(teams.id, teamId));
}

export async function createInvite(
  ctx: AppContext,
  user: UserRow,
  teamId: string,
  input: CreateInviteInput,
): Promise<TeamInviteDTO> {
  const role = await roleIn(ctx.db, teamId, user.id);
  if (role !== 'owner' && role !== 'captain')
    throw forbidden('Only the owner or a captain can invite players.');
  const active = await activeInvites(ctx.db, teamId);
  if (active.length >= MAX_ACTIVE_INVITES)
    throw new AppError(
      'CONFLICT',
      `A team can have at most ${MAX_ACTIVE_INVITES} active invites. Revoke one first.`,
    );
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode(8);
    try {
      const [row] = await ctx.db
        .insert(teamInvites)
        .values({
          code,
          teamId,
          createdBy: user.id,
          maxUses: input.maxUses,
          expiresAt: new Date(Date.now() + input.expiresInHours * 3_600_000),
        })
        .returning();
      return {
        code: row!.code,
        createdAt: row!.createdAt.toISOString(),
        expiresAt: row!.expiresAt.toISOString(),
        maxUses: row!.maxUses,
        uses: 0,
        createdBy: user.displayName,
        revoked: false,
      };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new AppError('INTERNAL', 'Could not generate an invite code. Try again.');
}

export async function revokeInvite(
  ctx: AppContext,
  user: UserRow,
  teamId: string,
  code: string,
): Promise<void> {
  const role = await roleIn(ctx.db, teamId, user.id);
  if (role !== 'owner' && role !== 'captain')
    throw forbidden('Only the owner or a captain can revoke invites.');
  const rows = await ctx.db
    .update(teamInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(teamInvites.code, code),
        eq(teamInvites.teamId, teamId),
        isNull(teamInvites.revokedAt),
      ),
    )
    .returning({ code: teamInvites.code });
  if (!rows.length) throw notFound('Invite');
}

function inviteStatus(
  invite: typeof teamInvites.$inferSelect,
  memberCount: number,
  maxMembers: number,
): InviteStatus {
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt.getTime() <= Date.now()) return 'expired';
  if (invite.uses >= invite.maxUses) return 'exhausted';
  if (memberCount >= maxMembers) return 'full';
  return 'valid';
}

export async function previewInvite(db: Db, code: string): Promise<InvitePreviewDTO> {
  const rows = await db
    .select({ invite: teamInvites, team: teams })
    .from(teamInvites)
    .innerJoin(teams, eq(teams.id, teamInvites.teamId))
    .where(eq(teamInvites.code, code))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError('INVITE_INVALID', 'That invite code does not exist.');
  const [c] = await db
    .select({ n: count() })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, row.team.id));
  const memberCount = Number(c?.n ?? 0);
  return {
    code,
    status: inviteStatus(row.invite, memberCount, row.team.maxMembers),
    expiresAt: row.invite.expiresAt.toISOString(),
    team: {
      name: row.team.name,
      tag: row.team.tag,
      memberCount,
      maxMembers: row.team.maxMembers,
      description: row.team.description,
    },
  };
}

export async function acceptInvite(ctx: AppContext, user: UserRow, code: string): Promise<string> {
  return ctx.db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(teamInvites)
      .where(eq(teamInvites.code, code))
      .for('update');
    if (!invite) throw new AppError('INVITE_INVALID', 'That invite code does not exist.');
    const [team] = await tx.select().from(teams).where(eq(teams.id, invite.teamId)).for('update');
    if (!team) throw new AppError('INVITE_INVALID', 'That team no longer exists.');
    const mine = await tx
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, user.id))
      .limit(1);
    if (mine[0]?.teamId === team.id)
      throw new AppError('ALREADY_IN_TEAM', 'You are already in this team.');
    if (mine[0])
      throw new AppError('ALREADY_IN_TEAM', 'Leave your current team before joining another.');
    const [c] = await tx
      .select({ n: count() })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, team.id));
    const status = inviteStatus(invite, Number(c?.n ?? 0), team.maxMembers);
    if (status === 'revoked')
      throw new AppError('INVITE_INVALID', 'This invite was revoked by the team.');
    if (status === 'expired')
      throw new AppError('INVITE_EXPIRED', 'This invite has expired. Ask the team for a new one.');
    if (status === 'exhausted')
      throw new AppError(
        'INVITE_EXPIRED',
        'This invite has been used up. Ask the team for a new one.',
      );
    if (status === 'full')
      throw new AppError('TEAM_FULL', `${team.name} is full (${team.maxMembers} members).`);
    try {
      await tx.insert(teamMembers).values({ teamId: team.id, userId: user.id, role: 'member' });
    } catch (err) {
      if (isUniqueViolation(err))
        throw new AppError('ALREADY_IN_TEAM', 'You are already in a team.');
      throw err;
    }
    await tx
      .update(teamInvites)
      .set({ uses: invite.uses + 1 })
      .where(eq(teamInvites.code, code));
    return team.id;
  });
}

export async function setMemberRole(
  ctx: AppContext,
  user: UserRow,
  teamId: string,
  targetId: string,
  role: TeamRole,
): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const myRole = await roleIn(db, teamId, user.id);
    if (myRole !== 'owner') throw forbidden('Only the team owner can change roles.');
    if (targetId === user.id)
      throw new AppError('BAD_REQUEST', 'Transfer ownership to another member instead.');
    const targetRole = await roleIn(db, teamId, targetId);
    if (!targetRole) throw notFound('Team member');
    if (role === 'owner') {
      await tx
        .update(teamMembers)
        .set({ role: 'captain' })
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)));
      await tx
        .update(teamMembers)
        .set({ role: 'owner' })
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetId)));
    } else {
      await tx
        .update(teamMembers)
        .set({ role })
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetId)));
    }
  });
}

export async function removeMember(
  ctx: AppContext,
  user: UserRow,
  teamId: string,
  targetId: string,
): Promise<void> {
  const myRole = await roleIn(ctx.db, teamId, user.id);
  if (!myRole) throw forbidden('You are not in this team.');
  if (targetId === user.id) throw new AppError('BAD_REQUEST', 'Use “Leave team” to leave.');
  const targetRole = await roleIn(ctx.db, teamId, targetId);
  if (!targetRole) throw notFound('Team member');
  const allowed = myRole === 'owner' || (myRole === 'captain' && targetRole === 'member');
  if (!allowed)
    throw forbidden(
      myRole === 'captain'
        ? 'Captains can only remove members.'
        : 'Only the owner or a captain can remove members.',
    );
  await ctx.db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetId)));
}

export async function leaveTeam(
  ctx: AppContext,
  user: UserRow,
  teamId: string,
): Promise<{ disbanded: boolean }> {
  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const role = await roleIn(db, teamId, user.id);
    if (!role) throw new AppError('NOT_IN_TEAM', 'You are not in this team.');
    if (role === 'owner') {
      const [c] = await tx
        .select({ n: count() })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamId));
      if (Number(c?.n ?? 0) > 1)
        throw new AppError(
          'OWNER_MUST_TRANSFER',
          'Transfer ownership to another member before leaving.',
        );
      await tx.delete(teams).where(eq(teams.id, teamId));
      return { disbanded: true };
    }
    await tx
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)));
    return { disbanded: false };
  });
}

/**
 * Before an account is deleted: hand team ownership to the longest-serving
 * captain (or member), or disband the team if the owner was alone.
 */
export async function releaseOwnership(db: Db, userId: string): Promise<void> {
  const mine = await teamOf(db, userId);
  if (!mine || mine.role !== 'owner') return;
  const others = await db
    .select({ userId: teamMembers.userId, role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, mine.teamId), sql`${teamMembers.userId} <> ${userId}`))
    .orderBy(
      sql`case when ${teamMembers.role} = 'captain' then 0 else 1 end`,
      asc(teamMembers.joinedAt),
    )
    .limit(1);
  if (others[0]) {
    await db
      .update(teamMembers)
      .set({ role: 'owner' })
      .where(and(eq(teamMembers.teamId, mine.teamId), eq(teamMembers.userId, others[0].userId)));
  } else {
    await db.delete(teams).where(eq(teams.id, mine.teamId));
  }
}
