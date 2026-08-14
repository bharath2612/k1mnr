import { test, expect } from '@playwright/test';

const PUBLISHED_SLUG = 'india-coal-import-outlook-2026';
const DRAFT_SLUG = 'draft-not-for-public-eyes';

test.describe('homepage survived the Astro port', () => {
  test('renders the hero and every original section', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.hero h1')).toContainText('Driving industrial continuity');

    for (const id of ['about', 'products', 'industries', 'services', 'process', 'contact']) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }

    // The Organization JSON-LD must survive — it is the site's primary
    // structured data and lives in one shared module now.
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(JSON.parse(ld!)['@type']).toBe('Organization');
  });

  test('has the new Industry Insights tab in nav and footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.nav-links a[href="/insights"]')).toHaveText('Industry Insights');
    await expect(page.locator('footer a[href="/insights"]')).toHaveCount(1);
  });

  test('no asset 404s on a nested route', async ({ page }) => {
    // Bugs from relative asset paths are invisible on / and only appear one
    // level deep, which is exactly why this asserts on a post page.
    const failed: string[] = [];
    page.on('response', (r) => {
      if (r.status() === 404 && new URL(r.url()).pathname.startsWith('/assets/')) {
        failed.push(r.url());
      }
    });
    await page.goto(`/insights/${PUBLISHED_SLUG}`, { waitUntil: 'networkidle' });
    expect(failed).toEqual([]);
  });
});

test.describe('insights listing', () => {
  test('lists published posts and excludes drafts', async ({ page }) => {
    await page.goto('/insights');
    await expect(page.locator('.post-card')).not.toHaveCount(0);
    await expect(page.locator('.post-card')).toContainText(['coal import outlook']);
    await expect(page.locator('body')).not.toContainText('Draft that must never');
  });
});

test.describe('post page SEO', () => {
  test('emits canonical, OG and article metadata', async ({ page }) => {
    await page.goto(`/insights/${PUBLISHED_SLUG}`);

    await expect(page).toHaveTitle(/coal import outlook/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://k1mnr.com/insights/${PUBLISHED_SLUG}`,
    );
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );

    // A social preview with no image is the failure mode this whole blog
    // exists to avoid, so assert the image tag is present and absolute.
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage).toMatch(/^https?:\/\//);

    await expect(page.locator('meta[property="article:published_time"]')).toHaveCount(1);

    // Exactly one h1 in the article — the sanitizer demotes any h1 the writer
    // types in the body. Scoped to <article> because Playwright locators pierce
    // shadow DOM and would otherwise match Astro's dev-toolbar UI.
    await expect(page.locator('article h1')).toHaveCount(1);
  });

  test('emits BlogPosting and BreadcrumbList structured data', async ({ page }) => {
    await page.goto(`/insights/${PUBLISHED_SLUG}`);
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const types = blocks.map((b) => JSON.parse(b)['@type']);
    expect(types).toContain('BlogPosting');
    expect(types).toContain('BreadcrumbList');
  });

  test('article HTML is server-rendered, not injected by JS', async ({ request }) => {
    // Social crawlers do not execute JavaScript. If the body is not in the
    // raw response, shared links have no preview and indexing suffers.
    const html = await (await request.get(`/insights/${PUBLISHED_SLUG}`)).text();
    expect(html).toContain('Why imports still matter');
  });

  test('a draft slug 404s', async ({ request }) => {
    expect((await request.get(`/insights/${DRAFT_SLUG}`)).status()).toBe(404);
  });
});

test.describe('feeds', () => {
  test('sitemap lists published posts and omits drafts', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text();
    expect(xml).toContain(`/insights/${PUBLISHED_SLUG}`);
    expect(xml).not.toContain(DRAFT_SLUG);
    // Canonical form has no trailing slash; a mismatch means duplicate content.
    expect(xml).toContain('<loc>https://k1mnr.com/insights</loc>');
  });

  test('rss is valid and excludes drafts', async ({ request }) => {
    const xml = await (await request.get('/rss.xml')).text();
    expect(xml).toContain('<rss');
    expect(xml).toContain('Industry Insights');
    expect(xml).not.toContain(DRAFT_SLUG);
  });
});
