import { expect, type Page } from '@playwright/test';

export const uniqueName = (prefix: string) =>
  `${prefix}${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;

/** Mark the tutorial as done so the lobby doesn't prompt for it. */
export async function skipTutorial(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const key = 'dbfc.settings.v1';
    const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...s, tutorialDone: true, reducedMotion: 'off' }));
  });
}

/**
 * Wait for the game session (test build hook) and let the autopilot play.
 * CI browsers render on the CPU at a few frames per second, so the test build
 * simulates faster than real time (the server's wall-clock check is disabled
 * in the e2e environment).
 */
export async function autopilot(page: Page, timeScale = 30): Promise<void> {
  await page.waitForFunction(() => !!window.__dbfc?.session, null, { timeout: 30_000 });
  await page.evaluate((scale) => {
    window.__dbfc?.setAutopilot(true);
    window.__dbfc?.setTimeScale?.(scale);
  }, timeScale);
}

/** Speed up simulated time without the autopilot (tutorial tests). */
export async function fastForward(page: Page, timeScale: number): Promise<void> {
  await page.waitForFunction(() => !!window.__dbfc?.session, null, { timeout: 30_000 });
  await page.evaluate((scale) => window.__dbfc?.setTimeScale?.(scale), timeScale);
}

export async function register(
  page: Page,
  username: string,
  password = 'e2e password 123',
): Promise<void> {
  await page.goto('/auth?mode=register');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page
    .getByRole('button', { name: /Create account/ })
    .last()
    .click();
  await expect(page).toHaveURL(/\/play/);
}

declare global {
  interface Window {
    __dbfc?: {
      session: {
        sim: { tick: number; stats: { jumps: number }; hearts: number; x: number };
      } | null;
      setAutopilot(on: boolean): void;
      setTimeScale?(n: number): void;
    };
  }
}
