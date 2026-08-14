import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { listPublishedForFeed } from '../lib/posts';
import { renderMarkdown, toPlainText } from '../lib/markdown';
import { SITE_URL, absoluteUrl } from '../lib/organization';

export const prerender = false;

export async function GET(context: APIContext) {
  const posts = await listPublishedForFeed();

  const response = await rss({
    title: 'K One Minerals — Industry Insights',
    description:
      'Analysis on thermal and metallurgical coal markets, port logistics and industrial procurement.',
    site: context.site ?? SITE_URL,
    trailingSlash: false,
    items: posts.map((post) => ({
      title: post.title,
      link: absoluteUrl(`/insights/${post.slug}`),
      pubDate: post.published_at ? new Date(post.published_at) : new Date(post.updated_at),
      description: post.excerpt ?? toPlainText(post.body_md, 300),
      author: post.author_name ?? undefined,
      // Full article HTML, already sanitized by the same renderer the site uses.
      content: renderMarkdown(post.body_md),
    })),
    customData: '<language>en-in</language>',
  });

  response.headers.set(
    'cache-control',
    'public, s-maxage=3600, stale-while-revalidate=86400',
  );
  return response;
}
