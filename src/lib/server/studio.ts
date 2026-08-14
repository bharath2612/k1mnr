import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceDb } from './supabase';
import { hashIp, clientIp } from './session';

/**
 * Shared helpers for the /api/studio/* handlers. Everything in this module
 * uses the service-role client and must never be reachable from the client
 * bundle — `npm run build` greps dist/ to enforce that.
 */

export const POSTS = 'blog_posts';
export const AUDIT = 'blog_studio_audit';
export const LOGIN_ATTEMPTS = 'blog_studio_login_attempts';

export const MAX_ATTEMPTS = 10;
export const WINDOW_MINUTES = 15;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export type AuditAction = 'login' | 'login_failed' | 'publish' | 'unpublish' | 'delete';

export async function audit(
  db: SupabaseClient,
  action: AuditAction,
  opts: { postId?: string | null; authorName?: string | null; ipHash?: string | null; detail?: string | null } = {},
): Promise<void> {
  try {
    await db.from(AUDIT).insert({
      action,
      post_id: opts.postId ?? null,
      author_name: opts.authorName ?? null,
      ip_hash: opts.ipHash ?? null,
      detail: opts.detail ?? null,
    });
  } catch (err) {
    // Never let an audit-write failure break the user's action.
    console.error('[studio] audit write failed:', err);
  }
}

/**
 * Rate limiting that survives serverless. An in-process counter is useless on
 * Vercel — functions are multi-instance and cold-start constantly — so the
 * window lives in Postgres.
 *
 * Returns true when the caller is over the limit.
 */
export async function isRateLimited(db: SupabaseClient, ipHash: string): Promise<boolean> {
  const now = Date.now();
  const { data } = await db
    .from(LOGIN_ATTEMPTS)
    .select('ip_hash, window_start, count')
    .eq('ip_hash', ipHash)
    .maybeSingle<{ ip_hash: string; window_start: string; count: number }>();

  if (!data) return false;

  const windowAge = (now - new Date(data.window_start).getTime()) / 60_000;
  if (windowAge > WINDOW_MINUTES) return false; // stale window, treated as reset
  return data.count >= MAX_ATTEMPTS;
}

export async function recordFailedAttempt(db: SupabaseClient, ipHash: string): Promise<void> {
  const { data } = await db
    .from(LOGIN_ATTEMPTS)
    .select('window_start, count')
    .eq('ip_hash', ipHash)
    .maybeSingle<{ window_start: string; count: number }>();

  const stale =
    !data || (Date.now() - new Date(data.window_start).getTime()) / 60_000 > WINDOW_MINUTES;

  await db.from(LOGIN_ATTEMPTS).upsert(
    stale
      ? { ip_hash: ipHash, window_start: new Date().toISOString(), count: 1 }
      : { ip_hash: ipHash, count: (data?.count ?? 0) + 1 },
    { onConflict: 'ip_hash' },
  );
}

export async function clearAttempts(db: SupabaseClient, ipHash: string): Promise<void> {
  await db.from(LOGIN_ATTEMPTS).delete().eq('ip_hash', ipHash);
}

/** Bundles the per-request bits every studio handler needs. */
export async function studioContext(request: Request) {
  const db = serviceDb();
  const ip = clientIp(request);
  return { db, ip, ipHash: await hashIp(ip) };
}

/**
 * Purge the edge cache for the routes a publish/unpublish affects.
 *
 * The Vercel adapter serves on-demand routes through ISR with a 60s window.
 * Without this the writer publishes, refreshes, sees nothing, and reports the
 * CMS as broken. With a bypass token configured this makes it immediate.
 */
export async function purgeIsr(slug: string | null, bypassToken?: string): Promise<void> {
  if (!bypassToken) return;
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  if (!base) return;

  const paths = ['/insights', '/sitemap.xml', '/rss.xml'];
  if (slug) paths.push(`/insights/${slug}`);

  await Promise.allSettled(
    paths.map((p) =>
      fetch(`${base}${p}`, { headers: { 'x-prerender-revalidate': bypassToken } }),
    ),
  );
}
