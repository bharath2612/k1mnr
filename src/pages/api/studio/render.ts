import type { APIRoute } from 'astro';
import { isAuthed, unauthorized } from '../../../lib/server/session';
import { json } from '../../../lib/server/studio';
import { renderMarkdown, readingMinutes } from '../../../lib/markdown';

export const prerender = false;

/**
 * The studio preview pane renders through this endpoint rather than running a
 * second copy of `marked` in the browser.
 *
 * That is the whole point: one renderer means the preview cannot drift from
 * what actually ships, and the sanitizer allowlist exists in exactly one place.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await isAuthed({ cookies }))) return unauthorized();

  let body_md = '';
  try {
    body_md = ((await request.json()) as { body_md?: string }).body_md ?? '';
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  return json({
    html: renderMarkdown(body_md),
    reading_minutes: readingMinutes(body_md),
  });
};
