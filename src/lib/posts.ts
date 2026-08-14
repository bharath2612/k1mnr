import { publicDb } from './server/supabase';

/**
 * The only module that talks to Supabase for the public read path. Pages call
 * these functions and get plain DTOs back — no `.astro` file constructs a
 * query. That boundary is what makes the storage layer swappable later.
 *
 * Every function degrades to an empty result rather than throwing: the
 * marketing site must not 500 because the database had a bad minute. The
 * homepage is fully prerendered and never calls in here at all.
 */

export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_md: string;
  cover_url: string | null;
  cover_alt: string | null;
  cover_width: number | null;
  cover_height: number | null;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  reading_minutes: number | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
}

export type PostCard = Pick<
  Post,
  | 'id' | 'slug' | 'title' | 'excerpt' | 'cover_url' | 'cover_alt'
  | 'cover_width' | 'cover_height' | 'tags' | 'published_at' | 'reading_minutes'
>;

const CARD_COLUMNS =
  'id,slug,title,excerpt,cover_url,cover_alt,cover_width,cover_height,tags,published_at,reading_minutes';

/** Published posts, newest first. Empty array on any failure. */
export async function listPublished(limit = 50): Promise<PostCard[]> {
  try {
    const { data, error } = await publicDb
      .from('blog_posts')
      .select(CARD_COLUMNS)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[posts] listPublished failed:', error.message);
      return [];
    }
    return (data ?? []) as PostCard[];
  } catch (err) {
    console.error('[posts] listPublished threw:', err);
    return [];
  }
}

/** A single published post. Null if missing, draft, or on failure. */
export async function getBySlug(slug: string): Promise<Post | null> {
  try {
    const { data, error } = await publicDb
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (error) {
      console.error('[posts] getBySlug failed:', error.message);
      return null;
    }
    return (data as Post) ?? null;
  } catch (err) {
    console.error('[posts] getBySlug threw:', err);
    return null;
  }
}

/**
 * Resolve a retired slug to its post's current slug, so an edited permalink
 * 301s instead of 404ing.
 */
export async function getRedirectTarget(oldSlug: string): Promise<string | null> {
  try {
    const { data: redirect, error } = await publicDb
      .from('blog_post_redirects')
      .select('post_id')
      .eq('old_slug', oldSlug)
      .maybeSingle<{ post_id: string }>();

    if (error || !redirect) return null;

    // Deliberately a second query rather than a PostgREST embed: the embed
    // returns an array shape that has to be cast away, and this stays honest
    // about the fact that the target must itself still be published.
    const { data: post } = await publicDb
      .from('blog_posts')
      .select('slug')
      .eq('id', redirect.post_id)
      .eq('status', 'published')
      .maybeSingle<{ slug: string }>();

    return post?.slug ?? null;
  } catch {
    return null;
  }
}

/** Sitemap/RSS need slug + timestamps for every published post. */
export async function listPublishedForFeed(): Promise<
  Pick<Post, 'slug' | 'title' | 'excerpt' | 'published_at' | 'updated_at' | 'body_md' | 'author_name'>[]
> {
  try {
    const { data, error } = await publicDb
      .from('blog_posts')
      .select('slug,title,excerpt,published_at,updated_at,body_md,author_name')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[posts] listPublishedForFeed failed:', error.message);
      return [];
    }
    return (data ?? []) as never;
  } catch (err) {
    console.error('[posts] listPublishedForFeed threw:', err);
    return [];
  }
}

/** "13 August 2026" — the date format used on cards and post headers. */
export function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}
