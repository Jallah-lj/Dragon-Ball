/**
 * Socket.IO contract for the real-time "Ember Race" mode.
 *
 * Every racer runs the same seeded course locally; the server coordinates the
 * lobby, ready check and synchronized start, relays live progress (rendered as
 * ghost dragons), replays each finisher's inputs to verify the result, ranks
 * the field and awards placement points to teams.
 */
import type { Difficulty } from '../sim/difficulty';
import type { AbilityLoadout, Outcome, RunResult } from '../sim/simulation';
import type { StageId } from '../sim/stages';
import type { ErrorCode } from '../api/types';
import type { RaceProgressInput } from '../api/schemas';

export const RACE_MAX_PLAYERS = 6;
export const RACE_COUNTDOWN_MS = 3500;
export const RACE_PROGRESS_INTERVAL_MS = 100;
export const RACE_LOBBY_GRACE_MS = 20_000;
export const RACE_LOBBY_TTL_MS = 30 * 60_000;
/** Placement points for team standings (1st, 2nd, ...). */
export const RACE_PLACEMENT_POINTS = [10, 7, 5, 3, 2, 1] as const;

export type RaceVisibility = 'open' | 'team';
export type RacePhase = 'lobby' | 'countdown' | 'racing' | 'results' | 'closed';

/** Bit flags in progress updates (for ghost animation). */
export const RACE_FLAG = { sliding: 1, airborne: 2, dashing: 4, shielded: 8, hurt: 16 } as const;

export interface RacePlayerDTO {
  userId: string;
  displayName: string;
  avatar: string;
  skin: string;
  teamTag: string | null;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  finished: boolean;
  outcome: Outcome | null;
  score: number | null;
  placement: number | null;
  dnf: boolean;
  /** Abilities issued for this race (the client must simulate with exactly these). */
  abilities: AbilityLoadout | null;
}

export interface RaceRoomDTO {
  code: string;
  hostId: string;
  visibility: RaceVisibility;
  teamId: string | null;
  teamTag: string | null;
  difficulty: Difficulty;
  stage: StageId;
  phase: RacePhase;
  /** Present once the countdown starts. */
  seed: number | null;
  /** Server epoch ms at which the race begins (tick 0). */
  startAt: number | null;
  /** Server epoch ms after which unfinished racers are marked DNF. */
  deadline: number | null;
  players: RacePlayerDTO[];
  maxPlayers: number;
  minPlayers: number;
  createdAt: number;
  expiresAt: number;
}

export interface RaceRoomSummaryDTO {
  code: string;
  hostName: string;
  difficulty: Difficulty;
  stage: StageId;
  visibility: RaceVisibility;
  teamTag: string | null;
  players: number;
  maxPlayers: number;
}

export interface RaceProgressDTO extends RaceProgressInput {
  userId: string;
}

export interface RaceStandingDTO {
  userId: string;
  displayName: string;
  teamTag: string | null;
  placement: number;
  outcome: Outcome | null;
  score: number;
  ticks: number;
  dnf: boolean;
  points: number;
}

export interface RaceResultsDTO {
  code: string;
  difficulty: Difficulty;
  stage: StageId;
  standings: RaceStandingDTO[];
}

export type Ack<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: { code: ErrorCode; message: string } };

export interface RaceFinishPayload {
  inputs: number[];
  claimed: { score: number; ticks: number; outcome: Outcome };
}

export interface ClientToServerEvents {
  'clock:ping': (clientTime: number, ack: (serverTime: number) => void) => void;
  'race:list': (ack: (res: Ack<{ rooms: RaceRoomSummaryDTO[] }>) => void) => void;
  'race:create': (
    payload: { difficulty: Difficulty; stage: StageId; visibility: RaceVisibility },
    ack: (res: Ack<{ room: RaceRoomDTO }>) => void,
  ) => void;
  'race:join': (payload: { code: string }, ack: (res: Ack<{ room: RaceRoomDTO }>) => void) => void;
  'race:leave': (ack: (res: Ack) => void) => void;
  'race:ready': (payload: { ready: boolean }, ack: (res: Ack) => void) => void;
  'race:start': (ack: (res: Ack) => void) => void;
  'race:progress': (payload: RaceProgressInput) => void;
  'race:finish': (
    payload: RaceFinishPayload,
    ack: (res: Ack<{ result: RunResult }>) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'race:state': (room: RaceRoomDTO) => void;
  'race:countdown': (payload: {
    code: string;
    seed: number;
    startAt: number;
    serverNow: number;
  }) => void;
  'race:progress': (updates: RaceProgressDTO[]) => void;
  'race:finished': (standing: RaceStandingDTO) => void;
  'race:results': (results: RaceResultsDTO) => void;
  'race:closed': (payload: { code: string; reason: 'expired' | 'empty' | 'server' }) => void;
  'session:revoked': () => void;
}
