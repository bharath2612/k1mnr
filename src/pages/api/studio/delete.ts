import type { APIRoute } from 'astro';
import { isAuthed, unauthorized } from '../../../lib/server/session';
import { json, studioContext, audit, purgeIsr, POSTS } from '../../../lib/server/studio';
import { VERCEL_BYPASS_TOKEN } from 'astro:env/server';

export const prerender = false;

/**
 * Soft delete.
 *
 * The row is stamped, not removed: an accidental delete of a published post
 * is otherwise unrecoverable, and the audit trail would lose the post it
 * refers to. The public read policy excludes deleted_at rows, so the post
 * disappears from the site, the sitemap and the feed immediately, and the
 * partial unique index on slug frees the permalink for reuse.
 *
 * Recovery is a one-line SQL update:
 *   update public.blog_posts set deleted_at = null where id = '...';
 */
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
    .is('deleted_at', null)
    .maybeSingle();

  if (!post) return json({ error: 'Post not found.' }, 404);

  const { error } = await db
    .from(POSTS)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return json({ error: error.message }, 400);

  await audit(db, 'delete', {
    postId: id,
    authorName: post.author_name,
    ipHash,
    detail: `${post.slug} — ${post.title}`,
  });

  if (post.status === 'published') await purgeIsr(post.slug, VERCEL_BYPASS_TOKEN);

  return json({ ok: true, softDeleted: true });
};
