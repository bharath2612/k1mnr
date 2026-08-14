import type { APIRoute } from 'astro';
import { clearSessionCookie } from '../../../lib/server/session';
import { json } from '../../../lib/server/studio';

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  clearSessionCookie(cookies);
  return json({ ok: true });
};
