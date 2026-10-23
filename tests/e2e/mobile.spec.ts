import { expect, test } from '@playwright/test';
import { skipTutorial } from './helpers';

test('portrait phones get a rotate hint that can be dismissed, then touch controls jump without scrolling', async ({
  page,
}) => {
  await skipTutorial(page);
  await page.goto('/play/run?mode=solo&difficulty=easy&stage=emerald');
  await expect(page.getByRole('heading', { name: 'Turn your device' })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Play in portrait anyway' }).tap();
  await expect(page.getByRole('heading', { name: 'Turn your device' })).toBeHidden();
  const jump = page.getByRole('button', { name: 'Jump', exact: true });
  await expect(jump).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Slide' })).toBeVisible();
  await page.waitForFunction(() => (window.__dbfc?.session?.sim.tick ?? 0) > 5, null, {
    timeout: 90_000,
  });
  await jump.tap();
  await page.waitForFunction(() => (window.__dbfc?.session?.sim.stats.jumps ?? 0) >= 1);
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
});
