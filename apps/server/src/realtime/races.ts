/**
 * RaceService — server-authoritative coordination of live "Ember Race" rooms.
 */
import { eq } from 'drizzle-orm';
import {
  DIFFICULTIES,
  evaluateAchievements,
  RACE_COUNTDOWN_MS,
  RACE_LOBBY_GRACE_MS,
  RACE_LOBBY_TTL_MS,
  RACE_MAX_PLAYERS,
  RACE_PLACEMENT_POINTS,
  weekKey,
  type CreateRaceInput,
  type RaceFinishPayload,
  type RacePlayerDTO,
  type RaceResultsDTO,
  type RaceRoomDTO,
  type RaceRoomSummaryDTO,
  type RaceStandingDTO,
  type RunResult,
} from '@dbfc/shared';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { achievements, raceResults, userStats } from '../db/schema';
import { randomCode, randomSeed } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { addTeamPoints } from '../services/leaderboards';
import { completeRun, createRaceRun } from '../services/runs';
import { teamMembership, normalizeStats, type UserRow } from '../services/users';
import type { Room, RoomPlayer, RoomStore } from './roomStore';

/** After the countdown, the race lasts at most this long (then DNF). */
function raceDurationMs(room: Pick<Room, 'difficulty'>): number {
  const d = DIFFICULTIES[room.difficulty];
  // Generous upper bound: the fireball always reaches the shrine before this.
  return Math.ceil((d.courseLength / (d.baseSpeed * 0.9)) * 1000) + 30_000;
}

const RESULTS_TTL_MS = 5 * 60_000;

export interface RaceEvents {
  state(room: RaceRoomDTO): void;
  countdown(
    code: string,
    payload: { code: string; seed: number; startAt: number; serverNow: number },
  ): void;
  finished(code: string, standing: RaceStandingDTO): void;
  results(code: string, results: RaceResultsDTO): void;
  closed(code: string, reason: 'expired' | 'empty' | 'server'): void;
}

export class RaceService {
  constructor(
    private readonly ctx: AppContext,
    private readonly store: RoomStore,
    private readonly events: RaceEvents,
  ) {}

  // ------------------------------------------------------------- DTOs

  toDTO(room: Room): RaceRoomDTO {
    return {
      code: room.code,
      hostId: room.hostId,
      visibility: room.visibility,
      teamId: room.teamId,
      teamTag: room.teamTag,
      difficulty: room.difficulty,
      stage: room.stage,
      phase: room.phase,
      seed: room.phase === 'lobby' ? null : room.seed,
      startAt: room.startAt,
      deadline: room.deadline,
      players: room.players.map((p): RacePlayerDTO => ({
        userId: p.userId,
        displayName: p.displayName,
        avatar: p.avatar,
        skin: p.skin,
        teamTag: p.teamTag,
        ready: p.ready,
        connected: p.connected,
        isHost: p.userId === room.hostId,
        finished: p.finished,
        outcome: p.outcome,
        score: p.score,
        placement: p.placement,
        dnf: p.dnf,
        abilities: p.abilities,
      })),
      maxPlayers: RACE_MAX_PLAYERS,
      minPlayers: this.ctx.config.RACE_MIN_PLAYERS,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
    };
  }

  async listOpen(): Promise<RaceRoomSummaryDTO[]> {
    const rooms = await this.store.all();
    const now = Date.now();
    return rooms
      .filter(
        (r) =>
          r.phase === 'lobby' &&
          r.visibility === 'open' &&
          r.expiresAt > now &&
          r.players.length < RACE_MAX_PLAYERS,
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30)
      .map((r) => ({
        code: r.code,
        hostName: r.players.find((p) => p.userId === r.hostId)?.displayName ?? 'Unknown',
        difficulty: r.difficulty,
        stage: r.stage,
        visibility: r.visibility,
        teamTag: r.teamTag,
        players: r.players.length,
        maxPlayers: RACE_MAX_PLAYERS,
      }));
  }

  private async newPlayer(user: UserRow): Promise<RoomPlayer> {
    const team = user.isGuest ? null : await teamMembership(this.ctx.db, user.id);
    return {
      userId: user.id,
      displayName: user.displayName,
      avatar: user.avatar,
      skin: user.selectedSkin,
      isGuest: user.isGuest,
      teamId: team?.id ?? null,
      teamTag: team?.tag ?? null,
      ready: false,
      connected: true,
      disconnectedAt: null,
      joinedAt: Date.now(),
      runId: null,
      abilities: null,
      finished: false,
      outcome: null,
      score: null,
      ticks: null,
      dnf: false,
      placement: null,
      points: 0,
    };
  }

  // ------------------------------------------------------------- Lobby

  async create(user: UserRow, input: CreateRaceInput): Promise<Room> {
    await this.leaveCurrent(user.id);
    const player = await this.newPlayer(user);
    if (input.visibility === 'team' && !player.teamId) {
      throw new AppError('NOT_IN_TEAM', 'Join a team to host a team-only race.');
    }
    const now = Date.now();
    for (let attempt = 0; attempt < 8; attempt++) {
      const room: Room = {
        code: randomCode(6),
        hostId: user.id,
        visibility: input.visibility,
        teamId: input.visibility === 'team' ? player.teamId : null,
        teamTag: input.visibility === 'team' ? player.teamTag : null,
        difficulty: input.difficulty,
        stage: input.stage,
        phase: 'lobby',
        seed: null,
        startAt: null,
        deadline: null,
        resultsAt: null,
        players: [player],
        createdAt: now,
        expiresAt: now + RACE_LOBBY_TTL_MS,
        version: 0,
      };
      if (await this.store.create(room)) {
        await this.store.setUserRoom(user.id, room.code);
        return room;
      }
    }
    throw new AppError('INTERNAL', 'Could not create a race room. Try again.');
  }

  async join(user: UserRow, code: string): Promise<Room> {
    const existing = await this.store.get(code);
    if (!existing)
      throw new AppError('RACE_NOT_FOUND', 'No race with that code. Check the code and try again.');
    const isMember = existing.players.some((p) => p.userId === user.id);
    if (!isMember) {
      if (existing.phase === 'results' || existing.phase === 'closed')
        throw new AppError('RACE_EXPIRED', 'That race has already finished.');
      if (existing.phase !== 'lobby')
        throw new AppError('RACE_STARTED', 'That race has already started.');
      if (existing.expiresAt <= Date.now())
        throw new AppError('RACE_EXPIRED', 'That race lobby has expired.');
      await this.leaveCurrent(user.id, code);
    }
    const player = isMember ? null : await this.newPlayer(user);
    if (player && existing.visibility === 'team' && player.teamId !== existing.teamId) {
      throw new AppError(
        'FORBIDDEN',
        `This race is only open to members of team ${existing.teamTag ?? ''}.`,
      );
    }
    const res = await this.store.mutate(code, (room) => {
      const p = room.players.find((x) => x.userId === user.id);
      if (p) {
        // Reconnect: keep progress, mark connected.
        p.connected = true;
        p.disconnectedAt = null;
        return;
      }
      if (room.phase !== 'lobby')
        throw new AppError('RACE_STARTED', 'That race has already started.');
      if (room.players.length >= RACE_MAX_PLAYERS)
        throw new AppError('RACE_FULL', `That race is full (${RACE_MAX_PLAYERS} dragons).`);
      room.players.push(player!);
    });
    if (!res) throw new AppError('RACE_NOT_FOUND', 'No race with that code.');
    await this.store.setUserRoom(user.id, code);
    this.events.state(this.toDTO(res.room));
    return res.room;
  }

  /** Leave whatever room the user is in (except `keep`). */
  private async leaveCurrent(userId: string, keep?: string): Promise<void> {
    const current = await this.store.roomOfUser(userId);
    if (current && current !== keep) await this.leave(userId, current);
  }

  async leave(userId: string, code: string): Promise<void> {
    const res = await this.store.mutate(code, (room) => {
      const p = room.players.find((x) => x.userId === userId);
      if (!p) return 'absent' as const;
      if (room.phase === 'lobby' || room.phase === 'results' || room.phase === 'closed') {
        room.players = room.players.filter((x) => x.userId !== userId);
        if (room.hostId === userId && room.players[0]) room.hostId = room.players[0].userId;
      } else {
        // Leaving mid-race forfeits (DNF) but keeps the slot for the results.
        p.connected = false;
        p.disconnectedAt = Date.now();
        if (!p.finished) p.dnf = true;
      }
      return room.players.length === 0 ? ('empty' as const) : ('left' as const);
    });
    await this.store.setUserRoom(userId, null);
    if (!res) return;
    if (res.value === 'empty') {
      await this.store.delete(code);
      this.events.closed(code, 'empty');
      return;
    }
    this.events.state(this.toDTO(res.room));
    if (res.room.phase === 'racing' || res.room.phase === 'countdown')
      await this.maybeFinalize(code);
  }

  async setReady(userId: string, code: string, ready: boolean): Promise<void> {
    const res = await this.store.mutate(code, (room) => {
      if (room.phase !== 'lobby')
        throw new AppError('RACE_STARTED', 'The race has already started.');
      const p = room.players.find((x) => x.userId === userId);
      if (!p) throw new AppError('FORBIDDEN', 'You are not in this race.');
      p.ready = ready;
    });
    if (!res) throw new AppError('RACE_NOT_FOUND', 'No race with that code.');
    this.events.state(this.toDTO(res.room));
  }

  async start(userId: string, code: string): Promise<Room> {
    const minPlayers = this.ctx.config.RACE_MIN_PLAYERS;
    const res = await this.store.mutate(code, (room) => {
      if (room.hostId !== userId)
        throw new AppError('FORBIDDEN', 'Only the host can start the race.');
      if (room.phase !== 'lobby')
        throw new AppError('RACE_STARTED', 'The race has already started.');
      // Drop players who are gone; everyone remaining must be ready.
      room.players = room.players.filter((p) => p.connected);
      if (room.players.length < minPlayers) {
        throw new AppError('BAD_REQUEST', `At least ${minPlayers} dragons are needed to start.`);
      }
      const notReady = room.players.filter((p) => !p.ready && p.userId !== room.hostId);
      if (notReady.length)
        throw new AppError(
          'BAD_REQUEST',
          `Waiting for ${notReady.map((p) => p.displayName).join(', ')} to be ready.`,
        );
      const now = Date.now();
      room.phase = 'countdown';
      room.seed = randomSeed();
      room.startAt = now + RACE_COUNTDOWN_MS;
      room.deadline = room.startAt + raceDurationMs(room);
      room.expiresAt = room.deadline + RESULTS_TTL_MS;
      for (const p of room.players) p.ready = true;
    });
    if (!res) throw new AppError('RACE_NOT_FOUND', 'No race with that code.');
    const room = res.room;
    // Issue a server-side run ticket per racer (same seed for everyone).
    const tickets = await Promise.all(
      room.players.map(async (p) => {
        try {
          const t = await createRaceRun(
            this.ctx.db,
            { id: p.userId, isGuest: p.isGuest },
            {
              code: room.code,
              seed: room.seed!,
              difficulty: room.difficulty,
              stage: room.stage,
              deadline: new Date(room.deadline! + 60_000),
            },
          );
          return { userId: p.userId, ...t };
        } catch (err) {
          this.ctx.log.error({ err, userId: p.userId }, 'race ticket failed');
          return { userId: p.userId, runId: null, abilities: null };
        }
      }),
    );
    const updated = await this.store.mutate(code, (r) => {
      for (const t of tickets) {
        const p = r.players.find((x) => x.userId === t.userId);
        if (!p) continue;
        p.runId = t.runId;
        p.abilities = t.abilities;
        if (!t.runId) p.dnf = true;
      }
    });
    const finalRoom = updated?.room ?? room;
    this.events.state(this.toDTO(finalRoom));
    this.events.countdown(code, {
      code,
      seed: finalRoom.seed!,
      startAt: finalRoom.startAt!,
      serverNow: Date.now(),
    });
    return finalRoom;
  }

  /** Abilities the racer was issued (needed by the client to simulate identically). */
  async abilitiesFor(userId: string, code: string) {
    const room = await this.store.get(code);
    return room?.players.find((p) => p.userId === userId)?.abilities ?? null;
  }

  // ------------------------------------------------------------- Racing

  async finish(userId: string, code: string, payload: RaceFinishPayload): Promise<RunResult> {
    const room = await this.store.get(code);
    if (!room) throw new AppError('RACE_NOT_FOUND', 'No race with that code.');
    const player = room.players.find((p) => p.userId === userId);
    if (!player) throw new AppError('FORBIDDEN', 'You are not in this race.');
    if (room.phase !== 'racing' && room.phase !== 'countdown')
      throw new AppError('RACE_EXPIRED', 'This race is no longer running.');
    if (player.finished)
      throw new AppError('RUN_ALREADY_SUBMITTED', 'You already finished this race.');
    if (player.dnf) throw new AppError('RACE_EXPIRED', 'You left this race.');
    if (!player.runId || !room.startAt)
      throw new AppError('RUN_INVALID', 'No race ticket was issued for you.');
    let result: RunResult;
    try {
      const completion = await completeRun(this.ctx, userId, player.runId, payload, {
        startedAt: new Date(room.startAt),
      });
      result = completion.result;
    } catch (err) {
      await this.store.mutate(code, (r) => {
        const p = r.players.find((x) => x.userId === userId);
        if (p && !p.finished) p.dnf = true;
      });
      await this.maybeFinalize(code);
      throw err;
    }
    const res = await this.store.mutate(code, (r) => {
      const p = r.players.find((x) => x.userId === userId);
      if (!p || p.finished) return;
      p.finished = true;
      p.outcome = result.outcome;
      p.score = result.score;
      p.ticks = result.ticks;
    });
    if (res) {
      this.events.finished(code, {
        userId,
        displayName: player.displayName,
        teamTag: player.teamTag,
        placement: 0,
        outcome: result.outcome,
        score: result.score,
        ticks: result.ticks,
        dnf: false,
        points: 0,
      });
      this.events.state(this.toDTO(res.room));
    }
    await this.maybeFinalize(code);
    return result;
  }

  async disconnected(userId: string, code: string): Promise<void> {
    const res = await this.store.mutate(code, (room) => {
      const p = room.players.find((x) => x.userId === userId);
      if (!p) return;
      p.connected = false;
      p.disconnectedAt = Date.now();
    });
    if (res) this.events.state(this.toDTO(res.room));
  }

  /** Rank the field once every racer has finished or dropped out. */
  private async maybeFinalize(code: string, force = false): Promise<void> {
    const res = await this.store.mutate(code, (room) => {
      if (room.phase !== 'racing' && room.phase !== 'countdown') return null;
      const pending = room.players.filter((p) => !p.finished && !p.dnf);
      if (pending.length > 0 && !force) return null;
      for (const p of pending) p.dnf = true;
      const ranked = rankPlayers(room.players);
      const field = room.players.length;
      ranked.forEach((p, i) => {
        p.placement = i + 1;
        p.points = field >= 2 && !p.dnf ? (RACE_PLACEMENT_POINTS[i] ?? 0) : 0;
      });
      room.phase = 'results';
      room.resultsAt = Date.now();
      room.expiresAt = Date.now() + RESULTS_TTL_MS;
      return ranked.map((p) => ({ ...p }));
    });
    if (!res || !res.value) return;
    const standings = res.value;
    await this.persistResults(res.room, standings);
    this.events.state(this.toDTO(res.room));
    this.events.results(code, {
      code,
      difficulty: res.room.difficulty,
      stage: res.room.stage,
      standings: standings.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        teamTag: p.teamTag,
        placement: p.placement!,
        outcome: p.outcome,
        score: p.score ?? 0,
        ticks: p.ticks ?? 0,
        dnf: p.dnf,
        points: p.points,
      })),
    });
    for (const p of res.room.players) await this.store.setUserRoom(p.userId, null);
  }

  private async persistResults(room: Room, standings: RoomPlayer[]): Promise<void> {
    const players = standings.length;
    try {
      await this.ctx.db.transaction(async (tx) => {
        const db = tx as unknown as Db;
        for (const p of standings) {
          await tx.insert(raceResults).values({
            raceCode: room.code,
            userId: p.userId,
            teamId: p.isGuest ? null : p.teamId,
            runId: p.runId,
            placement: p.placement!,
            points: p.points,
            players,
            outcome: p.outcome,
            score: p.score ?? 0,
            ticks: p.ticks ?? 0,
            dnf: p.dnf,
          });
          if (p.teamId && !p.isGuest) {
            await addTeamPoints(
              db,
              ['all', weekKey()],
              p.teamId,
              p.points,
              p.placement === 1 && players >= 2 && !p.dnf,
            );
          }
          // Lifetime race stats + race achievements.
          const statsRows = await tx
            .select()
            .from(userStats)
            .where(eq(userStats.userId, p.userId))
            .for('update');
          const stats = normalizeStats(statsRows[0]?.stats);
          stats.races += 1;
          if (p.placement === 1 && players >= 2 && !p.dnf) stats.raceWins += 1;
          await tx
            .insert(userStats)
            .values({ userId: p.userId, stats: stats as unknown as Record<string, unknown> })
            .onConflictDoUpdate({
              target: userStats.userId,
              set: { stats: stats as unknown as Record<string, unknown>, updatedAt: new Date() },
            });
          if (!p.dnf) {
            const owned = await tx
              .select({ id: achievements.achievementId })
              .from(achievements)
              .where(eq(achievements.userId, p.userId));
            const earned = evaluateAchievements(
              { stats, race: { placement: p.placement!, players } },
              new Set(owned.map((a) => a.id)),
            );
            if (earned.length)
              await tx
                .insert(achievements)
                .values(earned.map((achievementId) => ({ userId: p.userId, achievementId })))
                .onConflictDoNothing();
          }
        }
      });
    } catch (err) {
      this.ctx.log.error({ err, code: room.code }, 'failed to persist race results');
    }
  }

  // ------------------------------------------------------------- Timers

  /** Periodic housekeeping: lobby grace, countdown→racing, deadlines, expiry. */
  async sweep(now = Date.now()): Promise<void> {
    const rooms = await this.store.all();
    for (const room of rooms) {
      try {
        if (room.phase === 'lobby') {
          const stale = room.players.filter(
            (p) =>
              !p.connected &&
              p.disconnectedAt !== null &&
              now - p.disconnectedAt > RACE_LOBBY_GRACE_MS,
          );
          for (const p of stale) await this.leave(p.userId, room.code);
          if (room.expiresAt <= now) {
            await this.store.delete(room.code);
            for (const p of room.players) await this.store.setUserRoom(p.userId, null);
            this.events.closed(room.code, 'expired');
          }
        } else if (room.phase === 'countdown' && room.startAt !== null && now >= room.startAt) {
          const res = await this.store.mutate(room.code, (r) => {
            if (r.phase === 'countdown') r.phase = 'racing';
          });
          if (res) this.events.state(this.toDTO(res.room));
        } else if (room.phase === 'racing' && room.deadline !== null && now >= room.deadline) {
          await this.maybeFinalize(room.code, true);
        } else if ((room.phase === 'results' || room.phase === 'closed') && room.expiresAt <= now) {
          await this.store.delete(room.code);
        }
      } catch (err) {
        this.ctx.log.warn({ err, code: room.code }, 'race sweep failed');
      }
    }
  }
}

/** Catches first (fastest first), then non-catches by score; DNFs last. */
export function rankPlayers(players: RoomPlayer[]): RoomPlayer[] {
  return [...players].sort((a, b) => {
    if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
    const ac = a.outcome === 'caught';
    const bc = b.outcome === 'caught';
    if (ac !== bc) return ac ? -1 : 1;
    if (ac && bc && a.ticks !== b.ticks) return (a.ticks ?? Infinity) - (b.ticks ?? Infinity);
    if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
    return a.joinedAt - b.joinedAt;
  });
}
