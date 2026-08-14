import type { APIRoute } from 'astro';
import { isAuthed, unauthorized } from '../../../lib/server/session';
import { json, studioContext, audit, purgeIsr, POSTS } from '../../../lib/server/studio';
import { VERCEL_BYPASS_TOKEN } from 'astro:env/server';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await isAuthed({ cookies }))) return unauthorized();

  let id = '';
  try {
    id = ((await request.json()) as { id?: string }).id ?? '';
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  if (!id) return json({ error: 'Invalid request.' }, 400);

  const { db, ipHash } = await studioContext(request);

  const { data: post } = await db
    .from(POSTS)
    .select('slug, title, status, author_name')
    .eq('id', id)
    .maybeSingle();

  if (!post) return json({ error: 'Post not found.' }, 404);

  const { error } = await db.from(POSTS).delete().eq('id', id);
  if (error) return json({ error: error.message }, 400);

  await audit(db, 'delete', {
    postId: null, // the FK is gone; keep the title in detail instead
    authorName: post.author_name,
    ipHash,
    detail: `${post.slug} — ${post.title}`,
  });

  if (post.status === 'published') await purgeIsr(post.slug, VERCEL_BYPASS_TOKEN);

  return json({ ok: true });
};
