import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the real production server bundle (apps/server/dist)
 * against an in-memory database, serving the test build of the web client
 * (apps/web/dist-e2e, which exposes the autopilot hook). Build first with:
 *   npm run build:e2e
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;

// Optional: a custom Chromium (e.g. sandboxes without Playwright's download CDN).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const launchOptions = executablePath
  ? {
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    }
  : undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(launchOptions ? { launchOptions } : {}),
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testIgnore: /mobile\.spec/,
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: 'node apps/server/dist/index.js',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    env: {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      PUBLIC_URL: baseURL,
      DATABASE_URL: 'pglite://memory',
      STATIC_DIR: 'apps/web/dist-e2e',
      RUN_MIN_WALLCLOCK_RATIO: '0',
      RATE_LIMIT_ENABLED: 'false',
      LOG_LEVEL: 'warn',
      REDIS_URL: '',
    },
  },
});
