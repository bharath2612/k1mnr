import type { APIRoute } from 'astro';
import { isAuthed, unauthorized } from '../../../lib/server/session';
import { json, studioContext, POSTS } from '../../../lib/server/studio';

export const prerender = false;

/** Full row for the editor, drafts included. Service-role, cookie-gated. */
export const GET: APIRoute = async ({ request, url, cookies }) => {
  if (!(await isAuthed({ cookies }))) return unauthorized();

  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'Missing id.' }, 400);

  const { db } = await studioContext(request);
  const { data, error } = await db.from(POSTS).select('*').eq('id', id).maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: 'Not found.' }, 404);
  return json({ post: data });
};
