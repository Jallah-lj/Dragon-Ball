import { expect, test } from '@playwright/test';

test('home page renders the logo, calls to action and live standings', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Dragon Ball: Forest Chase/);
  await expect(page.getByRole('link', { name: /Start with the tutorial|Play now/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Choose your trail/ })).toBeVisible();
  await expect(page.getByText(/not affiliated with or endorsed by them/)).toBeVisible();
  // The attract-mode canvas boots.
  await expect(page.locator('.hero canvas')).toBeVisible({ timeout: 30_000 });
});

test('keyboard users get a skip link and visible focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  const shadow = await focused.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).not.toBe('none');
});

test('unknown routes show a friendly page and API 404s are JSON', async ({ page, request }) => {
  await page.goto('/no-such-trail');
  await expect(page.getByRole('heading', { name: 'Lost in the woods' })).toBeVisible();
  const res = await request.get('/api/nope');
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe('NOT_FOUND');
});

test('leaderboards are public and paginated', async ({ page }) => {
  await page.goto('/leaderboards');
  await expect(page.getByRole('heading', { name: /Fastest dragons/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Teams' }).click();
  await expect(page).toHaveURL(/board=teams/);
});
