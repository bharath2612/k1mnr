import type { APIRoute } from 'astro';
import { isAuthed, unauthorized } from '../../../lib/server/session';
import { json, studioContext, POSTS } from '../../../lib/server/studio';
import { readingMinutes, slugify } from '../../../lib/markdown';

export const prerender = false;

interface SavePayload {
  id: string;
  title?: string;
  slug?: string;
  excerpt?: string | null;
  body_md?: string;
  cover_url?: string | null;
  cover_alt?: string | null;
  cover_width?: number | null;
  cover_height?: number | null;
  tags?: string[];
  seo_title?: string | null;
  seo_description?: string | null;
  author_name?: string | null;
  /** The updated_at the client last saw. Absent means "this is a new post". */
  known_updated_at?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await isAuthed({ cookies }))) return unauthorized();

  let payload: SavePayload;
  try {
    payload = (await request.json()) as SavePayload;
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  // The client generates the id up front so the storage path for uploads
  // exists before the row does. Validate it rather than trusting it.
  if (!payload.id || !UUID_RE.test(payload.id)) {
    return json({ error: 'Invalid post id.' }, 400);
  }

  const title = (payload.title ?? '').trim();

  // Deliberately refuse to persist an untitled post. Combined with the client
  // generating ids up front, this is what stops every abandoned tab from
  // leaving an orphan row behind.
  if (title.length < 3) {
    return json({ skipped: 'awaiting-title' });
  }

  const { db } = await studioContext(request);

  const fields = {
    title,
    slug: (payload.slug ?? '').trim() || slugify(title),
    excerpt: payload.excerpt?.trim() || null,
    body_md: payload.body_md ?? '',
    cover_url: payload.cover_url || null,
    cover_alt: payload.cover_alt?.trim() || null,
    cover_width: payload.cover_width ?? null,
    cover_height: payload.cover_height ?? null,
    tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean).slice(0, 12) : [],
    seo_title: payload.seo_title?.trim() || null,
    seo_description: payload.seo_description?.trim() || null,
    author_name: payload.author_name?.trim() || null,
    reading_minutes: readingMinutes(payload.body_md ?? ''),
  };

  const { data: existing } = await db
    .from(POSTS)
    .select('id, updated_at, status')
    .eq('id', payload.id)
    .maybeSingle<{ id: string; updated_at: string; status: string }>();

  // ---- New post -----------------------------------------------------------
  if (!existing) {
    const { data, error } = await db
      .from(POSTS)
      .insert({ id: payload.id, status: 'draft', ...fields })
      .select('id, slug, updated_at, status')
      .single();

    if (error) return json({ error: friendly(error.message) }, 400);
    return json({ post: data });
  }

  // ---- Optimistic concurrency --------------------------------------------
  // One shared passcode means two people can open the same post. Without this
  // check the second save silently overwrites the first and a paragraph just
  // disappears with no error anywhere.
  if (payload.known_updated_at && payload.known_updated_at !== existing.updated_at) {
    return json(
      {
        error: 'conflict',
        message:
          'This post was changed in another window. Reload to get the latest version — saving now would overwrite those edits.',
        server_updated_at: existing.updated_at,
      },
      409,
    );
  }

  const { data, error } = await db
    .from(POSTS)
    .update(fields)
    .eq('id', payload.id)
    // Re-assert the precondition inside the write itself, so two saves racing
    // between the SELECT above and here still cannot clobber each other.
    .eq('updated_at', existing.updated_at)
    .select('id, slug, updated_at, status')
    .maybeSingle();

  if (error) return json({ error: friendly(error.message) }, 400);
  if (!data) {
    return json(
      { error: 'conflict', message: 'This post changed while saving. Reload and try again.' },
      409,
    );
  }

  return json({ post: data });
};

/** Turn Postgres constraint names into something a writer can act on. */
function friendly(message: string): string {
  if (message.includes('blog_posts_slug_key') || message.includes('duplicate key')) {
    return 'That URL slug is already used by another post. Try a different one.';
  }
  if (message.includes('blog_posts_slug_format')) {
    return 'Slug must be lowercase letters, numbers and hyphens only (3–96 characters).';
  }
  if (message.includes('blog_posts_title_length')) {
    return 'Title must be between 3 and 160 characters.';
  }
  if (message.includes('blog_posts_excerpt_length')) {
    return 'Excerpt must be 320 characters or fewer.';
  }
  return message;
}
