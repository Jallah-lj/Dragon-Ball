import type { Server as HttpServer } from 'node:http';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  createRaceSchema,
  raceCodeSchema,
  raceProgressSchema,
  completeRunSchema,
  type Ack,
  type ClientToServerEvents,
  type RaceProgressDTO,
  type ServerToClientEvents,
} from '@dbfc/shared';
import type { AppContext } from '../context';
import { sessions, users } from '../db/schema';
import { sha256 } from '../lib/crypto';
import { AppError } from '../lib/errors';
import type { UserRow } from '../services/users';
import { MemoryRoomStore, RedisRoomStore } from './roomStore';
import { RaceService } from './races';

interface SocketData {
  user: UserRow;
  sessionId: string;
  room: string | null;
  budget: { tokens: number; at: number };
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type RaceSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function errorAck(err: unknown): { ok: false; error: { code: AppError['code']; message: string } } {
  if (err instanceof AppError)
    return { ok: false, error: { code: err.code, message: err.message } };
  if (err && typeof err === 'object' && 'issues' in err) {
    return { ok: false, error: { code: 'VALIDATION', message: 'Invalid request.' } };
  }
  return { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong.' } };
}

/** Simple token bucket: ~30 events/s sustained per socket. */
function allow(socket: RaceSocket, cost = 1): boolean {
  const b = socket.data.budget;
  const now = Date.now();
  b.tokens = Math.min(60, b.tokens + ((now - b.at) / 1000) * 30);
  b.at = now;
  if (b.tokens < cost) return false;
  b.tokens -= cost;
  return true;
}

export interface Realtime {
  io: IO;
  races: RaceService;
  revoke(userId: string, sessionIds: string[] | 'all'): Promise<void>;
  close(): Promise<void>;
}

export function attachRealtime(
  server: HttpServer,
  ctx: AppContext,
  isAllowedOrigin: (origin: string, host: string | undefined) => boolean,
): Realtime {
  const io: IO = new Server(server, {
    path: '/socket.io',
    serveClient: false,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    maxHttpBufferSize: 1_000_000,
    connectionStateRecovery: { maxDisconnectionDuration: 30_000, skipMiddlewares: false },
    // Reject cross-site WebSocket hijacking: the handshake Origin must be ours.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (!origin) return callback(null, true);
      callback(null, isAllowedOrigin(origin, req.headers.host));
    },
  });

  let subClient: Redis | null = null;
  if (ctx.redis) {
    subClient = ctx.redis.duplicate();
    io.adapter(createAdapter(ctx.redis, subClient));
  }

  const store = ctx.redis ? new RedisRoomStore(ctx.redis) : new MemoryRoomStore();
  const roomName = (code: string) => `race:${code}`;
  const races = new RaceService(ctx, store, {
    state: (room) => io.to(roomName(room.code)).emit('race:state', room),
    countdown: (code, payload) => io.to(roomName(code)).emit('race:countdown', payload),
    finished: (code, standing) => io.to(roomName(code)).emit('race:finished', standing),
    results: (code, results) => io.to(roomName(code)).emit('race:results', results),
    closed: (code, reason) => {
      io.to(roomName(code)).emit('race:closed', { code, reason });
      io.in(roomName(code)).socketsLeave(roomName(code));
    },
  });

  // Authenticate the handshake with the same session cookie as the HTTP API.
  io.use(async (socket, next) => {
    try {
      const token = parseCookies(socket.handshake.headers.cookie).dbfc_sid;
      if (!token) return next(new Error('UNAUTHORIZED'));
      const rows = await ctx.db
        .select({ session: sessions, user: users })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(
            eq(sessions.tokenHash, sha256(token)),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!rows[0]) return next(new Error('UNAUTHORIZED'));
      socket.data.user = rows[0].user;
      socket.data.sessionId = rows[0].session.id;
      socket.data.room = null;
      socket.data.budget = { tokens: 60, at: Date.now() };
      next();
    } catch (err) {
      ctx.log.error({ err }, 'socket auth failed');
      next(new Error('UNAUTHORIZED'));
    }
  });

  // Progress relay: keep the latest sample per racer and flush at 10 Hz.
  const pending = new Map<string, Map<string, RaceProgressDTO>>();
  const flush = setInterval(() => {
    for (const [code, updates] of pending) {
      if (updates.size) io.to(roomName(code)).volatile.emit('race:progress', [...updates.values()]);
    }
    pending.clear();
  }, 100);
  const sweeper = setInterval(() => void races.sweep(), 1000);

  io.on('connection', (socket: RaceSocket) => {
    const user = socket.data.user;
    void socket.join(`user:${user.id}`);

    const run = <T extends object>(
      ack: ((res: Ack<T>) => void) | undefined,
      fn: () => Promise<T>,
    ) => {
      if (typeof ack !== 'function') return;
      if (!allow(socket, 2)) {
        ack({ ok: false, error: { code: 'RATE_LIMITED', message: 'Slow down a little.' } });
        return;
      }
      fn()
        .then((value) => ack({ ok: true, ...value } as Ack<T>))
        .catch((err: unknown) => {
          if (!(err instanceof AppError)) ctx.log.error({ err }, 'race handler failed');
          ack(errorAck(err));
        });
    };

    const enter = async (code: string) => {
      if (socket.data.room && socket.data.room !== code)
        await socket.leave(roomName(socket.data.room));
      socket.data.room = code;
      await socket.join(roomName(code));
    };

    socket.on('clock:ping', (_clientTime, ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    socket.on('race:list', (ack) => run(ack, async () => ({ rooms: await races.listOpen() })));

    socket.on('race:create', (payload, ack) =>
      run(ack, async () => {
        const input = createRaceSchema.parse(payload);
        const room = await races.create(user, input);
        await enter(room.code);
        const dto = races.toDTO(room);
        io.to(roomName(room.code)).emit('race:state', dto);
        return { room: dto };
      }),
    );

    socket.on('race:join', (payload, ack) =>
      run(ack, async () => {
        const code = raceCodeSchema.parse(payload?.code);
        const room = await races.join(user, code);
        await enter(code);
        return { room: races.toDTO(room) };
      }),
    );

    socket.on('race:leave', (ack) =>
      run(ack, async () => {
        const code = socket.data.room;
        if (code) {
          await races.leave(user.id, code);
          await socket.leave(roomName(code));
          socket.data.room = null;
        }
        return {};
      }),
    );

    socket.on('race:ready', (payload, ack) =>
      run(ack, async () => {
        if (!socket.data.room) throw new AppError('RACE_NOT_FOUND', 'Join a race first.');
        await races.setReady(user.id, socket.data.room, Boolean(payload?.ready));
        return {};
      }),
    );

    socket.on('race:start', (ack) =>
      run(ack, async () => {
        if (!socket.data.room) throw new AppError('RACE_NOT_FOUND', 'Join a race first.');
        await races.start(user.id, socket.data.room);
        return {};
      }),
    );

    socket.on('race:progress', (payload) => {
      const code = socket.data.room;
      if (!code || !allow(socket, 0.5)) return;
      const parsed = raceProgressSchema.safeParse(payload);
      if (!parsed.success) return;
      let updates = pending.get(code);
      if (!updates) {
        updates = new Map();
        pending.set(code, updates);
      }
      updates.set(user.id, { ...parsed.data, userId: user.id });
    });

    socket.on('race:finish', (payload, ack) =>
      run(ack, async () => {
        if (!socket.data.room) throw new AppError('RACE_NOT_FOUND', 'Join a race first.');
        const body = completeRunSchema.parse(payload);
        const result = await races.finish(user.id, socket.data.room, body);
        return { result };
      }),
    );

    socket.on('disconnect', () => {
      const code = socket.data.room;
      if (!code) return;
      void (async () => {
        // Only mark disconnected if no other socket of this user is in the room.
        const others = (await io.in(roomName(code)).fetchSockets()).filter(
          (s) => s.data.user?.id === user.id,
        );
        if (others.length === 0) await races.disconnected(user.id, code);
      })().catch((err: unknown) => ctx.log.warn({ err }, 'disconnect handling failed'));
    });
  });

  return {
    io,
    races,
    async revoke(userId, sessionIds) {
      const sockets = await io.in(`user:${userId}`).fetchSockets();
      for (const s of sockets) {
        if (sessionIds === 'all' || sessionIds.includes(s.data.sessionId)) {
          s.emit('session:revoked');
          s.disconnect(true);
        }
      }
    },
    async close() {
      clearInterval(flush);
      clearInterval(sweeper);
      // Disconnect clients but leave the HTTP server to Fastify.
      io.disconnectSockets(true);
      io.engine.close();
      subClient?.disconnect();
    },
  };
}
