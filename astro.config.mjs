// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  site: 'https://k1mnr.com',

  // Canonical URLs have no trailing slash. This MUST match vercel.json's
  // `trailingSlash: false`, or Google sees /insights and /insights/ as duplicates.
  trailingSlash: 'never',

  // Static by default; only routes that need live data opt out via
  // `export const prerender = false`. The homepage stays fully prerendered so
  // the marketing site never depends on Supabase being up.
  output: 'static',

  adapter: vercel({
    // On-demand rendered pages are cached at the edge for 60s, and the publish
    // handler purges them immediately via the bypass token. /studio and /api
    // are never cached.
    isr: {
      expiration: 60,
      exclude: [/^\/api\/.*/, /^\/studio(\/.*)?$/],
      // Lets /api/studio/publish purge the edge cache immediately via an
      // x-prerender-revalidate request. Without it a publish still goes live,
      // just up to 60s later — the studio says so explicitly in that case.
      bypassToken: process.env.VERCEL_BYPASS_TOKEN,
    },
    skewProtection: true,
  }),

  env: {
    schema: {
      // Nothing is client-context on purpose: the browser never talks to
      // Supabase directly. The public site reads via SSR, and /studio writes
      // through /api/studio/* which holds the service-role key server-side.
      SUPABASE_URL: envField.string({ context: 'server', access: 'public' }),
      SUPABASE_ANON_KEY: envField.string({ context: 'server', access: 'public' }),
      SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: 'server', access: 'secret' }),
      STUDIO_PASSCODE: envField.string({ context: 'server', access: 'secret' }),
      STUDIO_SECRET: envField.string({ context: 'server', access: 'secret' }),
      VERCEL_BYPASS_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
    validateSecrets: true,
  },
});
