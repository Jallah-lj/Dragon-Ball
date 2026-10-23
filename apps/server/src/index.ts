import { buildApp } from './app';
import { loadConfig } from './config';
import { loadDotEnv } from './env';

loadDotEnv();

const config = loadConfig();
const { app, close } = await buildApp(config);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  const timer = setTimeout(() => process.exit(1), 10_000);
  try {
    await close();
  } finally {
    clearTimeout(timer);
    process.exit(0);
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.HOST, port: config.PORT });
