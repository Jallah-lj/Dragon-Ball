import { loadConfig } from '../config';
import { loadDotEnv } from '../env';
import { createDatabase } from './client';

loadDotEnv();
const config = loadConfig();
const database = await createDatabase(config.DATABASE_URL, config.MIGRATIONS_DIR);
console.log(`Running migrations on ${database.kind}…`);
await database.migrate();
console.log('Migrations complete.');
await database.close();
