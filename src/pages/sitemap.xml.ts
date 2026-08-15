import type { APIRoute } from 'astro';
import { listPublishedForFeed } from '../lib/posts';
import { absoluteUrl } from '../lib/organization';
import { PRODUCTS, INDUSTRIES } from '../lib/catalog';

/**
 * Built at request time, not build time.
 *
 * @astrojs/sitemap only knows about routes that exist during the build, which
 * would mean every new post needed a redeploy to be discoverable. Drafts are
 * excluded because listPublishedForFeed reads through RLS.
 */
export const prerender = false;

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async () => {
  const posts = await listPublishedForFeed();

  const staticEntries = [
    { loc: absoluteUrl('/'), priority: '1.0', changefreq: 'monthly' },
    { loc: absoluteUrl('/products'), priority: '0.9', changefreq: 'monthly' },
    ...PRODUCTS.map((p) => ({
      loc: absoluteUrl(`/products/${p.slug}`),
      priority: '0.8',
      changefreq: 'monthly',
    })),
    { loc: absoluteUrl('/industries'), priority: '0.8', changefreq: 'monthly' },
    ...INDUSTRIES.map((ind) => ({
      loc: absoluteUrl(`/industries/${ind.slug}`),
      priority: '0.7',
      changefreq: 'monthly',
    })),
    { loc: absoluteUrl('/insights'), priority: '0.8', changefreq: 'weekly' },
  ];

  const urls = [
    ...staticEntries.map(
      (e) =>
        `  <url>\n    <loc>${e.loc}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
    ),
    ...posts.map(
      (p) =>
        `  <url>\n    <loc>${escape(absoluteUrl(`/insights/${p.slug}`))}</loc>\n` +
        `    <lastmod>${new Date(p.updated_at).toISOString()}</lastmod>\n` +
        `    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};
