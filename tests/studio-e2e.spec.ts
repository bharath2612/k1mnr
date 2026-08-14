import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Full authoring round-trip against the real database.
 *
 * Reads the passcode from .env rather than hardcoding it, so rotating the
 * passcode does not silently turn this suite into a no-op.
 */
const PASSCODE = (() => {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const m = env.match(/^STUDIO_PASSCODE="?(.*?)"?$/m);
  if (!m) throw new Error('STUDIO_PASSCODE not found in .env');
  return m[1];
})();

const BODY = `## Freight and blending

Coastal generators keep blending imported thermal coal because calorific
consistency is worth more than the headline price per tonne. This paragraph
exists to clear the 200-character minimum the publish validator enforces, and
to give the renderer something real to work on.

- Calorific consistency
- Predictable delivery windows

> Blending is a commercial decision before it is a technical one.
`;

test.describe.configure({ mode: 'serial' });

let postId = '';
let slug = '';

test('rejects a wrong passcode', async ({ request }) => {
  const res = await request.post('/api/studio/login', {
    data: { passcode: 'definitely-not-the-passcode' },
  });
  expect(res.status()).toBe(401);
});

test('accepts the correct passcode and sets a session cookie', async ({ request }) => {
  const res = await request.post('/api/studio/login', { data: { passcode: PASSCODE } });
  expect(res.ok()).toBeTruthy();
});

test('creates and saves a draft', async ({ request }) => {
  await request.post('/api/studio/login', { data: { passcode: PASSCODE } });

  postId = crypto.randomUUID();
  slug = `e2e-test-post-${Date.now()}`;

  const res = await request.post('/api/studio/save', {
    data: {
      id: postId,
      title: 'E2E test post',
      slug,
      excerpt: 'Created by the automated end-to-end test. Deleted at the end of the run.',
      body_md: BODY,
      cover_url: 'https://k1mnr.com/assets/coal-train.jpg',
      cover_alt: 'Loaded coal rake',
      cover_width: 1600,
      cover_height: 900,
      tags: ['Test'],
      author_name: 'Automated Test',
      known_updated_at: null,
    },
  });

  expect(res.ok()).toBeTruthy();
  const { post } = await res.json();
  expect(post.status).toBe('draft');
  expect(post.slug).toBe(slug);
});

test('draft is not publicly readable', async ({ request }) => {
  expect((await request.get(`/insights/${slug}`)).status()).toBe(404);
});

test('rejects a stale write (optimistic concurrency)', async ({ request }) => {
  await request.post('/api/studio/login', { data: { passcode: PASSCODE } });

  // Simulates a second tab saving over a first tab's stale view.
  const res = await request.post('/api/studio/save', {
    data: {
      id: postId,
      title: 'E2E test post (clobbered)',
      slug,
      body_md: BODY,
      known_updated_at: '2000-01-01T00:00:00.000Z',
    },
  });

  expect(res.status()).toBe(409);
  expect((await res.json()).error).toBe('conflict');
});

test('server-rendered preview uses the same sanitizer as the live page', async ({ request }) => {
  await request.post('/api/studio/login', { data: { passcode: PASSCODE } });

  const res = await request.post('/api/studio/render', {
    data: { body_md: '# demote me\n\n<script>alert(1)</script>\n\n**bold**' },
  });

  const { html } = await res.json();
  expect(html).toContain('<h2>demote me</h2>');
  expect(html).not.toContain('<script');
  expect(html).toContain('<strong>bold</strong>');
});

test('refuses to publish an incomplete post', async ({ request }) => {
  await request.post('/api/studio/login', { data: { passcode: PASSCODE } });

  const incompleteId = crypto.randomUUID();
  await request.post('/api/studio/save', {
    data: { id: incompleteId, title: 'Incomplete post', body_md: 'too short' },
  });

  const res = await request.post('/api/studio/publish', {
    data: { id: incompleteId, action: 'publish' },
  });

  expect(res.status()).toBe(422);
  const { problems } = await res.json();
  expect(problems.join(' ')).toMatch(/Excerpt|Cover|Body/);

  await request.post('/api/studio/delete', { data: { id: incompleteId } });
});

test('publishes, and the post becomes publicly readable with correct SEO', async ({ request }) => {
  await request.post('/api/studio/login', { data: { passcode: PASSCODE } });

  const res = await request.post('/api/studio/publish', {
    data: { id: postId, action: 'publish' },
  });
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).status).toBe('published');

  const html = await (await request.get(`/insights/${slug}`)).text();
  expect(html).toContain('Freight and blending');
  expect(html).toContain(`https://k1mnr.com/insights/${slug}`);
  expect(html).toContain('BlogPosting');

  // And it must now appear in the feeds.
  expect(await (await request.get('/sitemap.xml')).text()).toContain(slug);
});

test('unpublishing removes it from the site again', async ({ request }) => {
  await request.post('/api/studio/login', { data: { passcode: PASSCODE } });

  const res = await request.post('/api/studio/publish', {
    data: { id: postId, action: 'unpublish' },
  });
  expect(res.ok()).toBeTruthy();

  expect((await request.get(`/insights/${slug}`)).status()).toBe(404);
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain(slug);
});

test('cleans up', async ({ request }) => {
  await request.post('/api/studio/login', { data: { passcode: PASSCODE } });
  const res = await request.post('/api/studio/delete', { data: { id: postId } });
  expect(res.ok()).toBeTruthy();
});
