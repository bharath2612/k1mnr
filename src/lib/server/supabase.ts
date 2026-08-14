import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
} from 'astro:env/server';

/**
 * Client used for the PUBLIC read path (listing, post pages, sitemap, RSS).
 *
 * This intentionally uses the anon key even though it runs on the server: RLS
 * is then the thing enforcing "published posts only", so a mistake in a query
 * cannot leak a draft. Reads never rely on application-level filtering alone.
 */
export const publicDb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Client used ONLY by /api/studio/* route handlers. Bypasses RLS entirely.
 *
 * Never import this from a component, a layout, or anything reachable from a
 * client-side <script>. `npm run build` greps the client output for this key
 * and fails if it ever escapes (see scripts/check-secrets.mjs).
 */
export function serviceDb(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const STORAGE_BUCKET = 'blog-media';

/** Host that inline post images must live on, used by the HTML sanitizer. */
export const STORAGE_HOST = new URL(SUPABASE_URL).host;
