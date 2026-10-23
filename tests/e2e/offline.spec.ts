import { expect, test } from '@playwright/test';
import { autopilot, skipTutorial } from './helpers';

test('solo play keeps working when the server is unreachable', async ({ page }) => {
  await skipTutorial(page);
  await page.route('**/api/**', (route) => route.abort('connectionrefused'));
  await page.goto('/play');
  await expect(page.getByText(/Offline mode/)).toBeVisible();
  await page.getByRole('button', { name: 'Start chase' }).click();
  await expect(page.getByText(/Offline run — not ranked/)).toBeVisible({ timeout: 30_000 });
  await autopilot(page);
  await expect(page.getByRole('heading', { name: 'Fireball caught!' })).toBeVisible({
    timeout: 150_000,
  });
  await expect(page.getByText(/Offline · not ranked/)).toBeVisible();
  const local = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('dbfc.local.v1') ?? '{}'),
  );
  expect(local.records[0].catches).toBe(1);
});
