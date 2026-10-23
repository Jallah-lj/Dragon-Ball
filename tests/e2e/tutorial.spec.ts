import { expect, test } from '@playwright/test';
import { fastForward } from './helpers';

test('the tutorial freezes at each lesson and continues on the right key', async ({ page }) => {
  await page.goto('/play/run?mode=tutorial');
  await fastForward(page, 6);
  const card = page.getByRole('dialog', { name: 'Jump' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card.getByText('Lesson 1 of 6')).toBeVisible();
  // Wrong key: still frozen.
  await page.keyboard.press('ArrowDown');
  await expect(card).toBeVisible();
  await page.keyboard.press('Space');
  await expect(card).toBeHidden();
  const slide = page.getByRole('dialog', { name: 'Slide' });
  await expect(slide).toBeVisible({ timeout: 60_000 });
  await page.keyboard.down('ArrowDown');
  await expect(slide).toBeHidden();
  await page.keyboard.up('ArrowDown');
  await expect(page.getByRole('dialog', { name: 'Fire Dash' })).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('ShiftLeft');
  await expect(page.getByRole('dialog', { name: 'Forest Leap' })).toBeVisible({ timeout: 60_000 });
  const hearts = await page.evaluate(() => window.__dbfc?.session?.sim.hearts);
  expect(hearts).toBe(5);
});
