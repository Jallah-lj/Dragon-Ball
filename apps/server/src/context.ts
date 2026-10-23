import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type { Config } from './config';
import type { Database, Db } from './db/client';
import type { Mailer } from './lib/mailer';

/** Shared dependencies handed to routes, services and realtime handlers. */
export interface AppContext {
  config: Config;
  database: Database;
  db: Db;
  mailer: Mailer;
  redis: Redis | null;
  log: FastifyBaseLogger;
  /** Notifies realtime connections that a user's sessions were revoked. */
  onSessionsRevoked: (userId: string, sessionIds: string[] | 'all') => void;
}
