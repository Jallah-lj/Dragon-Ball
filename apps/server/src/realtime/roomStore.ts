/**
 * Race room persistence. In a single instance rooms live in memory; with
 * REDIS_URL they live in Redis so any instance can serve any player (the
 * Socket.IO Redis adapter fans out broadcasts across instances).
 */
import type { Redis } from 'ioredis';
import type {
  AbilityLoadout,
  Difficulty,
  Outcome,
  RacePhase,
  RaceVisibility,
  StageId,
} from '@dbfc/shared';

export interface RoomPlayer {
  userId: string;
  displayName: string;
  avatar: string;
  skin: string;
  isGuest: boolean;
  teamId: string | null;
  teamTag: string | null;
  ready: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  joinedAt: number;
  runId: string | null;
  abilities: AbilityLoadout | null;
  finished: boolean;
  outcome: Outcome | null;
  score: number | null;
  ticks: number | null;
  dnf: boolean;
  placement: number | null;
  points: number;
}

export interface Room {
  code: string;
  hostId: string;
  visibility: RaceVisibility;
  teamId: string | null;
  teamTag: string | null;
  difficulty: Difficulty;
  stage: StageId;
  phase: RacePhase;
  seed: number | null;
  startAt: number | null;
  deadline: number | null;
  resultsAt: number | null;
  players: RoomPlayer[];
  createdAt: number;
  expiresAt: number;
  version: number;
}

export interface RoomStore {
  get(code: string): Promise<Room | null>;
  /** Insert a new room; false if the code is taken. */
  create(room: Room): Promise<boolean>;
  /**
   * Atomically apply `fn` to a copy of the room and save it. `fn` must be
   * synchronous and may throw to abort. Returns null if the room is missing.
   */
  mutate<T>(code: string, fn: (room: Room) => T): Promise<{ room: Room; value: T } | null>;
  delete(code: string): Promise<void>;
  all(): Promise<Room[]>;
  roomOfUser(userId: string): Promise<string | null>;
  setUserRoom(userId: string, code: string | null): Promise<void>;
}

const clone = (r: Room): Room => structuredClone(r);

export class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();
  private users = new Map<string, string>();

  async get(code: string) {
    const r = this.rooms.get(code);
    return r ? clone(r) : null;
  }

  async create(room: Room) {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, clone(room));
    return true;
  }

  async mutate<T>(code: string, fn: (room: Room) => T) {
    const current = this.rooms.get(code);
    if (!current) return null;
    const copy = clone(current);
    const value = fn(copy);
    copy.version++;
    this.rooms.set(code, copy);
    return { room: clone(copy), value };
  }

  async delete(code: string) {
    this.rooms.delete(code);
    for (const [u, c] of this.users) if (c === code) this.users.delete(u);
  }

  async all() {
    return [...this.rooms.values()].map(clone);
  }

  async roomOfUser(userId: string) {
    return this.users.get(userId) ?? null;
  }

  async setUserRoom(userId: string, code: string | null) {
    if (code) this.users.set(userId, code);
    else this.users.delete(userId);
  }
}

const KEY = (code: string) => `dbfc:race:room:${code}`;
const INDEX = 'dbfc:race:rooms';
const USER = (id: string) => `dbfc:race:user:${id}`;
const TTL_SECONDS = 60 * 60;

export class RedisRoomStore implements RoomStore {
  constructor(private readonly redis: Redis) {}

  async get(code: string) {
    const raw = await this.redis.get(KEY(code));
    return raw ? (JSON.parse(raw) as Room) : null;
  }

  async create(room: Room) {
    const ok = await this.redis.set(KEY(room.code), JSON.stringify(room), 'EX', TTL_SECONDS, 'NX');
    if (ok) await this.redis.sadd(INDEX, room.code);
    return ok === 'OK';
  }

  async mutate<T>(code: string, fn: (room: Room) => T) {
    for (let attempt = 0; attempt < 20; attempt++) {
      // A dedicated connection is needed for WATCH/MULTI isolation.
      const conn = this.redis.duplicate();
      try {
        await conn.watch(KEY(code));
        const raw = await conn.get(KEY(code));
        if (!raw) {
          await conn.unwatch();
          return null;
        }
        const room = JSON.parse(raw) as Room;
        const value = fn(room);
        room.version++;
        const res = await conn
          .multi()
          .set(KEY(code), JSON.stringify(room), 'EX', TTL_SECONDS)
          .exec();
        if (res) return { room, value };
      } finally {
        conn.disconnect();
      }
    }
    throw new Error(`Race room ${code} is under heavy contention`);
  }

  async delete(code: string) {
    await this.redis.del(KEY(code));
    await this.redis.srem(INDEX, code);
  }

  async all() {
    const codes = await this.redis.smembers(INDEX);
    if (codes.length === 0) return [];
    const raws = await this.redis.mget(codes.map(KEY));
    const rooms: Room[] = [];
    for (let i = 0; i < codes.length; i++) {
      const raw = raws[i];
      if (raw) rooms.push(JSON.parse(raw) as Room);
      else await this.redis.srem(INDEX, codes[i]!);
    }
    return rooms;
  }

  async roomOfUser(userId: string) {
    return this.redis.get(USER(userId));
  }

  async setUserRoom(userId: string, code: string | null) {
    if (code) await this.redis.set(USER(userId), code, 'EX', TTL_SECONDS);
    else await this.redis.del(USER(userId));
  }
}
