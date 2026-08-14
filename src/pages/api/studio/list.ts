import type { APIRoute } from 'astro';
import { isAuthed, unauthorized } from '../../../lib/server/session';
import { json, studioContext, POSTS } from '../../../lib/server/studio';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  if (!(await isAuthed({ cookies }))) return unauthorized();

  const { db } = await studioContext(request);

  const { data, error } = await db
    .from(POSTS)
    .select('id,slug,title,status,published_at,updated_at,cover_url,author_name')
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) return json({ error: error.message }, 500);
  return json({ posts: data ?? [] });
};
