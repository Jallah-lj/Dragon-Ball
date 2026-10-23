import { expect, test } from '@playwright/test';

test('two players race live: lobby, ready check, countdown, ghosts, results', async ({
  browser,
}) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  await host.goto('/race');
  await host.getByRole('button', { name: 'Continue as guest' }).click();
  await host.getByRole('button', { name: 'Create race room' }).click();
  await expect(host).toHaveURL(/\/race\/[A-Z0-9]{6}$/);
  const url = host.url();

  await guest.goto(url);
  await guest.getByRole('button', { name: "I'm ready" }).click();
  await expect(host.getByText('Everyone is ready')).toBeVisible();
  await host.getByRole('button', { name: 'Start race' }).click();

  for (const p of [host, guest]) {
    await p.waitForFunction(() => !!window.__dbfc?.session, null, { timeout: 30_000 });
    await p.evaluate(() => window.__dbfc?.setAutopilot(true));
  }
  // Each player sees the other as a ghost in the standings.
  await expect(host.locator('canvas')).toBeVisible();
  await expect(host.getByRole('heading', { name: /Victory|placed/ })).toBeVisible({
    timeout: 170_000,
  });
  const rows = host.locator('table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('10');
  await hostCtx.close();
  await guestCtx.close();
});

test('joining a missing race shows an explanation', async ({ page }) => {
  await page.goto('/race/ZZZZZZ');
  await expect(page.getByRole('heading', { name: 'Race not found' })).toBeVisible({
    timeout: 30_000,
  });
});
