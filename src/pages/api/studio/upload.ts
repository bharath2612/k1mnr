import type { APIRoute } from 'astro';
import { isAuthed, unauthorized } from '../../../lib/server/session';
import { json, studioContext } from '../../../lib/server/studio';
import { STORAGE_BUCKET } from '../../../lib/server/supabase';

export const prerender = false;

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await isAuthed({ cookies }))) return unauthorized();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Invalid upload.' }, 400);
  }

  const file = form.get('file');
  const postId = String(form.get('post_id') ?? '');

  if (!(file instanceof File)) return json({ error: 'No file provided.' }, 400);

  // Path is derived from a validated uuid, never from client-supplied text —
  // otherwise a crafted post_id could traverse the bucket.
  if (!UUID_RE.test(postId)) return json({ error: 'Invalid post id.' }, 400);

  if (file.size > MAX_BYTES) {
    return json({ error: 'Image is larger than 5 MB. Please choose a smaller file.' }, 413);
  }

  const ext = ALLOWED.get(file.type);
  if (!ext) {
    return json({ error: 'Only JPG, PNG, WebP or AVIF images are allowed.' }, 415);
  }

  const { db } = await studioContext(request);
  const objectPath = `posts/${postId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, await file.arrayBuffer(), {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });

  if (error) return json({ error: error.message }, 400);

  const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);

  return json({
    url: data.publicUrl,
    path: objectPath,
    width: Number(form.get('width')) || null,
    height: Number(form.get('height')) || null,
  });
};
