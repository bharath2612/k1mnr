import { test, expect } from '@playwright/test';

/**
 * The studio holds a service-role key that bypasses RLS entirely. Every one of
 * these routes must be unreachable without a validly signed session cookie —
 * this is the single most important test in the project.
 */

const ROUTES: Array<{ method: 'GET' | 'POST'; path: string }> = [
  { method: 'GET', path: '/api/studio/list' },
  { method: 'GET', path: '/api/studio/post?id=00000000-0000-0000-0000-000000000000' },
  { method: 'POST', path: '/api/studio/save' },
  { method: 'POST', path: '/api/studio/render' },
  { method: 'POST', path: '/api/studio/publish' },
  { method: 'POST', path: '/api/studio/delete' },
  { method: 'POST', path: '/api/studio/upload' },
];

const BAD_COOKIES = [
  { label: 'forged signature', value: '9999999999.not-a-real-signature' },
  { label: 'expired but well-formed', value: '1.abc' },
  { label: 'garbage', value: 'garbage' },
  { label: 'empty', value: '' },
];

for (const { method, path } of ROUTES) {
  test(`${method} ${path} returns 401 without a cookie`, async ({ request }) => {
    const res =
      method === 'GET'
        ? await request.get(path)
        : await request.post(path, { data: {} });
    expect(res.status()).toBe(401);
  });
}

for (const cookie of BAD_COOKIES) {
  test(`rejects a ${cookie.label} cookie`, async ({ request }) => {
    const res = await request.get('/api/studio/list', {
      headers: { cookie: `k1_studio=${cookie.value}` },
    });
    expect(res.status()).toBe(401);
  });
}

test('studio page renders the passcode gate, not the editor', async ({ page }) => {
  await page.goto('/studio');
  await expect(page.locator('#gate')).toBeVisible();
  await expect(page.locator('#app')).not.toBeVisible();
});

test('draft preview redirects to the gate when unauthenticated', async ({ page }) => {
  await page.goto('/studio/preview/00000000-0000-0000-0000-000000000000');
  await expect(page).toHaveURL(/\/studio$/);
});

test('studio is noindex and uncacheable', async ({ request }) => {
  const res = await request.get('/studio');
  expect(res.headers()['cache-control']).toContain('no-store');
  expect(await res.text()).toContain('noindex');
});

test('robots.txt disallows the studio', async ({ request }) => {
  const body = await (await request.get('/robots.txt')).text();
  expect(body).toContain('Disallow: /studio');
});
