import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { io, type Socket } from 'socket.io-client';
import {
  Autopilot,
  ChaseSimulation,
  playWithAutopilot,
  type Ack,
  type ClientToServerEvents,
  type RaceResultsDTO,
  type RaceRoomDTO,
  type ServerToClientEvents,
} from '@dbfc/shared';
import type { BuiltApp } from '../src/app';
import { raceResults, teamLeaderboardEntries } from '../src/db/schema';
import { createTestApp, TestClient } from './helpers';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const REDIS = process.env.TEST_REDIS_URL ?? '';
const variants: [string, string][] = [['memory store', '']];
if (REDIS) variants.push(['redis store', REDIS]);

for (const [label, redisUrl] of variants) {
  describe(`live races (${label})`, () => {
    let built: BuiltApp;
    let url: string;
    const sockets: ClientSocket[] = [];

    beforeAll(async () => {
      built = await createTestApp({ RATE_LIMIT_ENABLED: false, REDIS_URL: redisUrl });
      await built.app.listen({ port: 0, host: '127.0.0.1' });
      url = `http://127.0.0.1:${(built.app.server.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
      for (const s of sockets) s.disconnect();
      if (redisUrl) await built.ctx.redis?.flushdb();
      await built.close();
    });

    function connect(client: TestClient | null, origin?: string): Promise<ClientSocket> {
      const s: ClientSocket = io(url, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        extraHeaders: {
          ...(client ? { cookie: client.cookieHeader() } : {}),
          ...(origin ? { origin } : {}),
        },
      });
      sockets.push(s);
      return new Promise((resolve, reject) => {
        s.on('connect', () => resolve(s));
        s.on('connect_error', (err) => reject(err));
      });
    }

    async function player(name: string) {
      const c = new TestClient(built.app);
      const user = await c.register(name);
      return { c, user, socket: await connect(c) };
    }

    const call = <T extends object>(
      s: ClientSocket,
      event: 'race:create' | 'race:join' | 'race:ready',
      payload: unknown,
    ): Promise<Ack<T>> =>
      new Promise((resolve) =>
        (s.emit as (e: string, p: unknown, cb: (r: Ack<T>) => void) => void)(
          event,
          payload,
          resolve,
        ),
      );
    const call0 = <T extends object>(
      s: ClientSocket,
      event: 'race:start' | 'race:leave' | 'race:list',
    ): Promise<Ack<T>> =>
      new Promise((resolve) =>
        (s.emit as (e: string, cb: (r: Ack<T>) => void) => void)(event, resolve),
      );
    const next = <K extends keyof ServerToClientEvents>(
      s: ClientSocket,
      event: K,
      predicate: (...args: Parameters<ServerToClientEvents[K]>) => boolean = () => true,
    ) =>
      new Promise<Parameters<ServerToClientEvents[K]>>((resolve) => {
        const handler = (...args: Parameters<ServerToClientEvents[K]>) => {
          if (predicate(...args)) {
            s.off(event, handler as never);
            resolve(args);
          }
        };
        s.on(event, handler as never);
      });

    it('rejects unauthenticated and cross-site connections', async () => {
      await expect(connect(null)).rejects.toThrow();
      const c = new TestClient(built.app);
      await c.guest();
      await expect(connect(c, 'https://evil.example')).rejects.toThrow();
      const ok = await connect(c, 'http://localhost:5173');
      expect(ok.connected).toBe(true);
      const offset: number = await new Promise((r) => ok.emit('clock:ping', Date.now(), r));
      expect(Math.abs(offset - Date.now())).toBeLessThan(5000);
    });

    it('authenticates sockets with a header token when cookies are unavailable', async () => {
      const res = await built.app.inject({
        method: 'POST',
        url: '/api/auth/guest',
        headers: { 'x-auth-mode': 'token' },
        payload: {},
      });
      const token = res.json().sessionToken as string;
      const s: ClientSocket = io(url, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        auth: { token },
      });
      sockets.push(s);
      await new Promise<void>((resolve, reject) => {
        s.on('connect', () => resolve());
        s.on('connect_error', reject);
      });
      const listed = await call0<{ rooms: unknown[] }>(s, 'race:list');
      expect(listed.ok).toBe(true);
      const bad: ClientSocket = io(url, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        auth: { token: 'x'.repeat(43) },
      });
      sockets.push(bad);
      await expect(
        new Promise((resolve, reject) => {
          bad.on('connect', () => resolve(undefined));
          bad.on('connect_error', reject);
        }),
      ).rejects.toThrow();
    });

    it('runs a full race: lobby → ready → countdown → verified finish → ranked results', async () => {
      const a = await player('RacerA');
      const b = await player('RacerB');
      // RacerA races for a team so placement points reach the team standings.
      const team = (await a.c.post('/api/teams', { name: 'Flame Chasers', tag: 'FLM' })).json();

      const created = await call<{ room: RaceRoomDTO }>(a.socket, 'race:create', {
        difficulty: 'easy',
        stage: 'emerald',
        visibility: 'open',
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const code = created.room.code;
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

      const listed = await call0<{ rooms: { code: string }[] }>(b.socket, 'race:list');
      expect(listed.ok && listed.rooms.some((r) => r.code === code)).toBe(true);

      const joined = await call<{ room: RaceRoomDTO }>(b.socket, 'race:join', { code });
      expect(joined.ok && joined.room.players.map((p) => p.displayName)).toEqual([
        'RacerA',
        'RacerB',
      ]);

      const early = await call0(a.socket, 'race:start');
      expect(early.ok).toBe(false);
      if (!early.ok) expect(early.error.message).toMatch(/RacerB/);
      const notHost = await call0(b.socket, 'race:start');
      expect(!notHost.ok && notHost.error.code).toBe('FORBIDDEN');

      expect((await call(b.socket, 'race:ready', { ready: true })).ok).toBe(true);
      const countdownA = next(a.socket, 'race:countdown');
      const countdownB = next(b.socket, 'race:countdown');
      const startedState = next(
        a.socket,
        'race:state',
        (r) => r.phase === 'countdown' && r.players.every((p) => p.abilities),
      );
      expect((await call0(a.socket, 'race:start')).ok).toBe(true);
      const [[cdA], [cdB], [state]] = await Promise.all([countdownA, countdownB, startedState]);
      expect(cdA.seed).toBe(cdB.seed);
      expect(cdA.startAt).toBeGreaterThan(Date.now());

      // Late joiners are refused.
      const c = await player('LateRacer');
      const late = await call(c.socket, 'race:join', { code });
      expect(!late.ok && late.error.code).toBe('RACE_STARTED');

      await new Promise((r) => setTimeout(r, Math.max(0, cdA.startAt - Date.now()) + 50));
      const play = (userId: string, mistakes: number) => {
        const me = state.players.find((p) => p.userId === userId)!;
        const sim = new ChaseSimulation({
          seed: cdA.seed,
          difficulty: 'easy',
          stage: 'emerald',
          abilities: me.abilities!,
        });
        const { inputs } = playWithAutopilot(
          sim,
          new Autopilot({ seed: 9, mistakeChance: mistakes }),
        );
        const r = sim.result();
        return {
          inputs,
          claimed: { score: r.score, ticks: r.ticks, outcome: r.outcome },
          result: r,
        };
      };
      const runA = play(a.user.id, 0);
      const runB = play(b.user.id, 0.6);

      const resultsPromise = next(a.socket, 'race:results');
      const finishedSeen = next(b.socket, 'race:finished', (s) => s.userId === a.user.id);
      const finA: Ack<{ result: { score: number } }> = await new Promise((r) =>
        a.socket.emit('race:finish', { inputs: runA.inputs, claimed: runA.claimed }, r as never),
      );
      expect(finA.ok && finA.result.score).toBe(runA.result.score);
      await finishedSeen;
      const dup: Ack = await new Promise((r) =>
        a.socket.emit('race:finish', { inputs: runA.inputs, claimed: runA.claimed }, r as never),
      );
      expect(!dup.ok && dup.error.code).toBe('RUN_ALREADY_SUBMITTED');
      const finB: Ack = await new Promise((r) =>
        b.socket.emit('race:finish', { inputs: runB.inputs, claimed: runB.claimed }, r as never),
      );
      expect(finB.ok).toBe(true);

      const [results] = (await resultsPromise) as [RaceResultsDTO];
      expect(results.standings).toHaveLength(2);
      const expectedWinner =
        runA.result.outcome === 'caught' &&
        (runB.result.outcome !== 'caught' || runA.result.ticks <= runB.result.ticks)
          ? a.user.id
          : b.user.id;
      expect(results.standings[0]!.userId).toBe(expectedWinner);
      expect(results.standings.map((s) => s.points)).toEqual([10, 7]);

      const rows = await built.ctx.db
        .select()
        .from(raceResults)
        .where(eq(raceResults.raceCode, code));
      expect(rows).toHaveLength(2);
      const teamRows = await built.ctx.db
        .select()
        .from(teamLeaderboardEntries)
        .where(eq(teamLeaderboardEntries.teamId, team.id));
      expect(teamRows.find((r) => r.periodKey === 'all')?.races).toBe(1);
      expect(teamRows.find((r) => r.periodKey === 'all')?.points).toBe(
        results.standings.find((s) => s.userId === a.user.id)!.points,
      );
      const profile = (await a.c.get('/api/profile')).json();
      expect(profile.progress.stats.races).toBe(1);
      expect(profile.achievements.map((x: { id: string }) => x.id)).toContain('team-spirit');
    });

    it('handles unknown codes, full rooms, reconnects and leaving', async () => {
      const host = await player('Host6');
      const unknown = await call(host.socket, 'race:join', { code: 'ZZZZZZ' });
      expect(!unknown.ok && unknown.error.code).toBe('RACE_NOT_FOUND');
      const bad = await call(host.socket, 'race:join', { code: '!!' });
      expect(!bad.ok && bad.error.code).toBe('VALIDATION');

      const created = await call<{ room: RaceRoomDTO }>(host.socket, 'race:create', {
        difficulty: 'easy',
        stage: 'emerald',
        visibility: 'open',
      });
      if (!created.ok) throw new Error('create failed');
      const code = created.room.code;
      const others = [];
      for (let i = 0; i < 5; i++) {
        const p = await player(`Filler${i}`);
        expect((await call(p.socket, 'race:join', { code })).ok).toBe(true);
        others.push(p);
      }
      const seventh = await player('Seventh');
      const full = await call(seventh.socket, 'race:join', { code });
      expect(!full.ok && full.error.code).toBe('RACE_FULL');

      // Disconnect + reconnect inside the grace period keeps the slot.
      const leaver = others[0]!;
      const sawDisconnect = next(host.socket, 'race:state', (r) =>
        r.players.some((p) => p.userId === leaver.user.id && !p.connected),
      );
      leaver.socket.disconnect();
      await sawDisconnect;
      const again = await connect(leaver.c);
      const rejoined = await call<{ room: RaceRoomDTO }>(again, 'race:join', { code });
      expect(
        rejoined.ok && rejoined.room.players.find((p) => p.userId === leaver.user.id)?.connected,
      ).toBe(true);

      // Leaving frees the slot; the host leaving hands over hosting.
      expect((await call0(again, 'race:leave')).ok).toBe(true);
      const nowFits = await call(seventh.socket, 'race:join', { code });
      expect(nowFits.ok).toBe(true);
      const handover = next(seventh.socket, 'race:state', (r) => r.hostId !== host.user.id);
      expect((await call0(host.socket, 'race:leave')).ok).toBe(true);
      const [afterHost] = await handover;
      expect(afterHost.players).toHaveLength(5);
    });

    it('team-only races are limited to team members', async () => {
      const owner = await player('TeamHost');
      await owner.c.post('/api/teams', { name: 'Moss Pack', tag: 'MOSS' });
      const created = await call<{ room: RaceRoomDTO }>(owner.socket, 'race:create', {
        difficulty: 'easy',
        stage: 'emerald',
        visibility: 'team',
      });
      expect(created.ok && created.room.teamTag).toBe('MOSS');
      if (!created.ok) return;
      const outsider = await player('Outsider');
      const res = await call(outsider.socket, 'race:join', { code: created.room.code });
      expect(!res.ok && res.error.code).toBe('FORBIDDEN');
      const loner = await player('Loner');
      const noTeam = await call(loner.socket, 'race:create', {
        difficulty: 'easy',
        stage: 'emerald',
        visibility: 'team',
      });
      expect(!noTeam.ok && noTeam.error.code).toBe('NOT_IN_TEAM');
    });

    it('disconnects sockets when the session is revoked', async () => {
      const p = await player('Revoked');
      const revoked = next(p.socket, 'session:revoked');
      const gone = new Promise((r) => p.socket.on('disconnect', r));
      expect((await p.c.post('/api/auth/logout-all')).statusCode).toBe(204);
      await revoked;
      await gone;
      expect(p.socket.connected).toBe(false);
    });
  });
}
