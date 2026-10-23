import http from 'node:http';
import { expect, test } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * Some browsers silently refuse the session cookie (for example third-party
 * cookie blocking while the game is embedded in another site's frame) while
 * still exposing the readable CSRF cookie. Signing in must still work: the
 * client verifies the session after signing in and falls back to a per-tab
 * header token. This proxy reproduces such a browser by stripping only the
 * session cookie from responses.
 */
const upstreamPort = Number(process.env.E2E_PORT ?? 3100);
const proxyPort = upstreamPort + 7;
let proxy: http.Server;

test.beforeAll(async () => {
  proxy = http.createServer((req, res) => {
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: upstreamPort,
        method: req.method,
        path: req.url,
        headers: req.headers,
      },
      (up) => {
        const headers = { ...up.headers };
        if (headers['set-cookie'])
          headers['set-cookie'] = headers['set-cookie'].filter((c) => !c.startsWith('dbfc_sid='));
        res.writeHead(up.statusCode ?? 502, headers);
        up.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
  await new Promise<void>((resolve) => proxy.listen(proxyPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise((resolve) => proxy.close(resolve));
});

test('signing in works when the browser drops the session cookie', async ({ page, context }) => {
  const base = `http://127.0.0.1:${proxyPort}`;
  const name = uniqueName('NoCookie');
  await page.goto(`${base}/auth?mode=register`);
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password').fill('e2e password 123');
  await page
    .getByRole('button', { name: /Create account/ })
    .last()
    .click();
  await expect(page).toHaveURL(/\/play/);
  expect((await context.cookies()).some((c) => c.name === 'dbfc_sid')).toBe(false);

  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Collection' }).click();
  await expect(page.getByRole('heading', { name: 'Your hoard' })).toBeVisible();
  await nav.getByRole('link', { name: 'Team' }).click();
  await expect(page.getByRole('heading', { name: 'Find your flight' })).toBeVisible();
  await expect(page.getByText('Please sign in or play as a guest first.')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('dbfc.authMode.v1'))).toBe('token');
});
