/**
 * Soft-delete a blog post by slug, exactly the way /api/studio/delete does it:
 * the row is stamped with deleted_at, never removed, so the action is
 * recoverable with `update ... set deleted_at = null`.
 *
 * Usage: node scripts/soft-delete-post.mjs <slug> [--dry-run]
 *
 * Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env in the repo root.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const slug = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!slug) {
  console.error('Usage: node scripts/soft-delete-post.mjs <slug> [--dry-run]');
  console.error('       node scripts/soft-delete-post.mjs --list');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(resolve(import.meta.dirname, '../.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env');
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

if (slug === '--list') {
  const all = await (
    await fetch(
      `${url}/rest/v1/blog_posts?deleted_at=is.null&select=slug,title,status,published_at&order=published_at.desc.nullslast`,
      { headers },
    )
  ).json();
  for (const p of all) console.log(`${p.status.padEnd(10)} ${p.slug.padEnd(40)} ${p.title}`);
  process.exit(0);
}

const q = `${url}/rest/v1/blog_posts?slug=eq.${encodeURIComponent(slug)}&deleted_at=is.null&select=id,slug,title,status,published_at`;
const rows = await (await fetch(q, { headers })).json();

if (!Array.isArray(rows) || rows.length === 0) {
  console.error(`No live post found with slug "${slug}". Nothing to do.`);
  process.exit(1);
}

const post = rows[0];
console.log(`Found: "${post.title}" (${post.status}, id ${post.id})`);

if (dryRun) {
  console.log('Dry run — not deleting.');
  process.exit(0);
}

const res = await fetch(`${url}/rest/v1/blog_posts?id=eq.${post.id}`, {
  method: 'PATCH',
  headers: { ...headers, Prefer: 'return=representation' },
  body: JSON.stringify({ deleted_at: new Date().toISOString() }),
});

if (!res.ok) {
  console.error(`PATCH failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const [updated] = await res.json();
console.log(`Soft-deleted "${updated.slug}" at ${updated.deleted_at}.`);
console.log('Recovery: update public.blog_posts set deleted_at = null where id =', `'${post.id}';`);
