import { expect, test } from '@playwright/test';
import { autopilot, skipTutorial } from './helpers';

test('a guest plays a full chase and the server verifies the result', async ({ page }) => {
  await skipTutorial(page);
  await page.goto('/play');
  await expect(page.getByRole('radio', { name: /^Wildwood Chase/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.getByRole('button', { name: 'Start chase' }).click();
  await expect(page).toHaveURL(/\/play\/run\?mode=solo&difficulty=easy&stage=emerald/);
  await expect(page.locator('.game-host canvas')).toBeVisible({ timeout: 30_000 });
  await autopilot(page);
  await expect(page.getByRole('heading', { name: 'Fireball caught!' })).toBeVisible({
    timeout: 150_000,
  });
  await expect(page.getByText('Verified by server')).toBeVisible();
  await expect(page.getByText(/\+\d[\d,]* XP/)).toBeVisible();
  await expect(page.getByText('First Catch')).toBeVisible();
  // Guests are verified but not ranked.
  await expect(page.getByText(/Guest runs don't appear on leaderboards/)).toBeVisible();
  // The catch unlocked Medium.
  await page.getByRole('button', { name: /Lobby/ }).click();
  await expect(page.getByRole('radio', { name: /^Wildwood Chase/ })).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

test('pause menu stops the run and resumes it', async ({ page }) => {
  await skipTutorial(page);
  await page.goto('/play/run?mode=solo&difficulty=easy&stage=emerald');
  await page.waitForFunction(() => (window.__dbfc?.session?.sim.tick ?? 0) > 30, null, {
    timeout: 60_000,
  });
  await page.keyboard.press('Escape');
  const dialog = page.getByRole('dialog', { name: /Forest Explorer/ });
  await expect(dialog).toBeVisible();
  const t1 = await page.evaluate(() => window.__dbfc!.session!.sim.tick);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__dbfc!.session!.sim.tick)).toBe(t1);
  await dialog.getByRole('button', { name: /Resume/ }).click();
  await page.waitForFunction((t) => (window.__dbfc?.session?.sim.tick ?? 0) > t + 10, t1);
});

test('jump key works and the HUD reports it', async ({ page }) => {
  await skipTutorial(page);
  await page.goto('/play/run?mode=solo&difficulty=easy&stage=emerald');
  await page.waitForFunction(() => (window.__dbfc?.session?.sim.tick ?? 0) > 5, null, {
    timeout: 60_000,
  });
  await page.keyboard.down('Space');
  await page.waitForTimeout(200);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => (window.__dbfc?.session?.sim.stats.jumps ?? 0) >= 1);
});
