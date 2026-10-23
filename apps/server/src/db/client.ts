import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { schema } from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: Db;
  kind: 'postgres' | 'pglite';
  migrate(folder?: string): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/** Locate the SQL migrations folder (works from src/ with tsx and from dist/ when bundled). */
export function migrationsFolder(override = ''): string {
  if (override) return resolve(override);
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    resolve(here, 'drizzle'),
    resolve(here, '../../drizzle'),
    resolve(here, '../drizzle'),
    resolve(process.cwd(), 'drizzle'),
    resolve(process.cwd(), 'apps/server/drizzle'),
  ]) {
    if (existsSync(resolve(candidate, 'meta/_journal.json'))) return candidate;
  }
  throw new Error('Could not find the drizzle migrations folder. Set MIGRATIONS_DIR.');
}

/**
 * Connect to the database named by DATABASE_URL:
 *   postgres://…        node-postgres connection pool
 *   pglite://<dir>      embedded PGlite persisted to a directory (zero-setup dev)
 *   pglite://memory     in-memory PGlite (tests)
 */
export async function createDatabase(url: string, migrationsDir = ''): Promise<Database> {
  if (url.startsWith('pglite://')) {
    const target = url.slice('pglite://'.length);
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    let client: InstanceType<typeof PGlite>;
    if (target === 'memory' || target === '') {
      client = new PGlite();
    } else {
      const dir = resolve(target);
      mkdirSync(dir, { recursive: true });
      client = new PGlite(dir);
    }
    await client.waitReady;
    const db = drizzle(client, { schema }) as unknown as Db;
    return {
      db,
      kind: 'pglite',
      migrate: async (folder) =>
        migrate(db as never, { migrationsFolder: folder ?? migrationsFolder(migrationsDir) }),
      ping: async () => {
        await db.execute(sql`select 1`);
        return true;
      },
      close: async () => {
        await client.close();
      },
    };
  }
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const pg = (await import('pg')).default;
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX ?? 10) });
    const db = drizzle(pool, { schema }) as unknown as Db;
    return {
      db,
      kind: 'postgres',
      migrate: async (folder) =>
        migrate(db as never, { migrationsFolder: folder ?? migrationsFolder(migrationsDir) }),
      ping: async () => {
        await pool.query('select 1');
        return true;
      },
      close: async () => {
        await pool.end();
      },
    };
  }
  throw new Error(`Unsupported DATABASE_URL: ${url.split(':')[0]}`);
}
