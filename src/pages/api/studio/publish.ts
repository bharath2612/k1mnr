import type { APIRoute } from 'astro';
import { isAuthed, unauthorized } from '../../../lib/server/session';
import { json, studioContext, audit, purgeIsr, POSTS } from '../../../lib/server/studio';
import { readingMinutes } from '../../../lib/text';
import { VERCEL_BYPASS_TOKEN } from 'astro:env/server';

export const prerender = false;

const MIN_BODY_CHARS = 200;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await isAuthed({ cookies }))) return unauthorized();

  let body: { id?: string; action?: 'publish' | 'unpublish' };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const { id, action } = body;
  if (!id || (action !== 'publish' && action !== 'unpublish')) {
    return json({ error: 'Invalid request.' }, 400);
  }

  const { db, ipHash } = await studioContext(request);

  const { data: post, error: readErr } = await db
    .from(POSTS)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (readErr || !post) return json({ error: 'Post not found.' }, 404);

  // ---- Unpublish ----------------------------------------------------------
  if (action === 'unpublish') {
    const { error } = await db.from(POSTS).update({ status: 'draft' }).eq('id', id);
    if (error) return json({ error: error.message }, 400);

    await audit(db, 'unpublish', { postId: id, authorName: post.author_name, ipHash });
    await purgeIsr(post.slug, VERCEL_BYPASS_TOKEN);
    return json({ ok: true, status: 'draft' });
  }

  // ---- Publish: validate everything the live page depends on --------------
  const problems: string[] = [];
  if (!post.title || post.title.trim().length < 3) problems.push('Title is required.');
  if (!post.slug) problems.push('URL slug is required.');
  if (!post.excerpt?.trim()) problems.push('Excerpt is required — it is the card text and the meta description.');
  if (!post.cover_url) problems.push('Cover image is required — without it shared links have no preview.');
  if (!post.cover_alt?.trim()) problems.push('Cover image alt text is required.');
  if ((post.body_md ?? '').trim().length < MIN_BODY_CHARS) {
    problems.push(`Body is too short (minimum ${MIN_BODY_CHARS} characters).`);
  }

  if (problems.length) return json({ error: 'validation', problems }, 422);

  const { data, error } = await db
    .from(POSTS)
    .update({
      status: 'published',
      reading_minutes: readingMinutes(post.body_md ?? ''),
    })
    .eq('id', id)
    .select('slug, status, published_at')
    .single();

  if (error) return json({ error: error.message }, 400);

  await audit(db, 'publish', { postId: id, authorName: post.author_name, ipHash, detail: data.slug });
  await purgeIsr(data.slug, VERCEL_BYPASS_TOKEN);

  return json({ ok: true, ...data, purged: Boolean(VERCEL_BYPASS_TOKEN) });
};
