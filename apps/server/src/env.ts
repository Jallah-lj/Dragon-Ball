import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Load the nearest `.env` (current directory, then the repository root) into
 * process.env without overriding variables that are already set.
 */
export function loadDotEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(here, '../../../.env'),
    resolve(here, '../../.env'),
  ];
  const file = candidates.find((c) => existsSync(c));
  if (file) process.loadEnvFile(file);
}
