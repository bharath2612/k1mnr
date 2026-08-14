# k1mnr.com

Marketing site for **K One Minerals & Natural Resources LLP**, plus the
**Industry Insights** blog and its in-house authoring tool.

Astro 7 · Supabase (Postgres + Storage) · Vercel

---

## Architecture in one page

| Route | Rendering | Notes |
|---|---|---|
| `/` | **Prerendered at build** | Never touches Supabase. A database outage cannot take the marketing site down. |
| `/insights` | On-demand + ISR (60s) | Listing of published posts. |
| `/insights/[slug]` | On-demand + ISR (60s) | Retired slugs 301 via `blog_post_redirects`. |
| `/sitemap.xml`, `/rss.xml` | On-demand | Generated from the DB, so new posts need no rebuild. |
| `/studio`, `/studio/preview/[id]` | On-demand, `no-store` | Excluded from ISR, `noindex`, disallowed in robots.txt. |
| `/api/studio/*` | On-demand, `no-store` | Service-role writes, gated by a signed cookie. |

### Security model

The browser **never** talks to Supabase directly.

- **Public reads** use the anon key server-side. RLS allows `select` on
  published posts only — drafts are invisible even to a buggy query. There are
  no write policies at all, and `anon`/`authenticated` are additionally
  `revoke`d from every blog table, so writes fail at the grant level before RLS
  is even evaluated.
- **All writes** go through `/api/studio/*`, which hold
  `SUPABASE_SERVICE_ROLE_KEY` server-side and require a valid studio session
  cookie (HMAC-SHA256 over an expiry, httpOnly, `Secure` in production).
- `npm run build` greps the client bundle for server secrets and **fails the
  build** if any appear (`scripts/check-secrets.mjs`).

Because the passcode is shared, there is no per-author identity. Mitigations:
a high-entropy passcode, table-backed rate limiting that survives serverless,
and a `blog_studio_audit` row for every login, publish, unpublish and delete.

### One markdown renderer

`src/lib/markdown.ts` is the only place markdown becomes HTML. The studio
preview pane calls it through `POST /api/studio/render` rather than running a
second copy in the browser, so **the preview cannot drift from what ships** and
the sanitizer allowlist exists in exactly one place.

Allowed tags: `h2 h3 h4 p strong em a ul ol li blockquote img hr br`. Any `h1`
a writer types is demoted to `h2` (the post title is the page's only `h1`).
Inline images are restricted to the Supabase Storage host. Tables and code
blocks are unsupported and degrade to plain text — visibly, in the preview.

---

## Local development

```bash
npm install
cp .env.example .env      # then fill in the values
npm run dev
```

Generate the studio secrets:

```bash
openssl rand -base64 24   # STUDIO_PASSCODE
openssl rand -base64 32   # STUDIO_SECRET
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Build **+ secret-leak check** |
| `npm run check` | `astro check` typecheck |
| `npm test` | Playwright smoke + auth suite |
| `npm run diff:visual` | Pixel-diff `/` against live k1mnr.com |

### The visual diff gate (historical)

`scripts/visual-diff.mjs` screenshots a reference URL against the local build at
390 / 820 / 1080 / 1440 px and fails over a 0.1% pixel delta. It existed to
prove one thing: that porting the hand-tuned `index.html` into Astro changed
nothing. It did that job — the port passed at 0.02–0.07%, pure antialiasing.

It is **not currently runnable**: its reference was the GitHub Pages site at
k1mnr.com, which has been retired, and the typeface has since deliberately
changed to Plus Jakarta Sans, so a pixel comparison against the old design
would fail by design. Keep it for the next structural refactor, pointing
`LIVE_URL` at a known-good deployment first:

```bash
LIVE_URL=https://k1mnr.vercel.app LOCAL_URL=http://localhost:4321 npm run diff:visual
```

```bash
npm run build && npm run preview &
npm run diff:visual
```

---

## Database

Migrations are in `supabase/migrations/`, applied to the **existing `crypto`
Supabase project** (the account was at its free-tier project limit). Blog
tables are therefore prefixed `blog_` and live in `public` — a dedicated schema
would have required changing that shared project's PostgREST exposed-schemas
setting, risking the other app on a later dashboard save.

- `blog_posts` — the posts. A `published` row is constrained to have
  `published_at`, `cover_url`, `cover_alt` and `excerpt`, so a bad write cannot
  produce a broken live page.
- `blog_post_redirects` — old slug → post, written by a trigger whenever a
  published post is renamed.
- `blog_studio_login_attempts` — rate-limit window (service-role only).
- `blog_studio_audit` — who did what, when (service-role only).

---

## Deploying to Vercel (cutover from GitHub Pages)

The site is currently served by **GitHub Pages** from `index.html` + `CNAME` at
the repo root. Those two files are intentionally still present: they are the
live fallback until the DNS cutover, and `index.html` is the diff gate's
reference. Delete them in the cutover commit.

1. Import the repo into Vercel. Framework preset: **Astro**. Deploy to
   `*.vercel.app` first — GitHub Pages stays live and untouched.
2. Set env vars (Production **and** Preview) from `.env.example`.
3. QA on the `*.vercel.app` URL: run `npm test` with `BASE_URL` pointed at it,
   and publish a test post end to end.
4. Spaceship DNS: lower TTL on `@` and `www` to 300, wait out the old TTL.
5. Vercel → Domains → add `k1mnr.com` + `www` (www redirects to apex). Use the
   exact records Vercel displays; Spaceship supports an apex `A` record only.
6. GitHub → Settings → Pages → remove the custom domain, set Source to None.
   Delete `CNAME` and `index.html` in the same PR.
7. Flip the Spaceship records. Watch `dig k1mnr.com +short` and the Vercel cert.
   Verify HTTPS, `/`, `/insights`, `/sitemap.xml`. Resubmit the sitemap in
   Google Search Console.
8. Restore TTL to 3600.

Rollback is free before step 6; after it, a DNS revert (≤5 min at TTL 300).

---

## Known trade-offs

- **No per-author identity.** Follows from the shared-passcode decision.
  `blog_studio_audit` is the compensating control. Moving to per-user magic
  links later changes only the gate on `/api/studio/*`, not the schema or the
  editor.
- **No CSP.** The site is built on inline `<style>`/`<script>`, so a real CSP
  needs hashing or nonces throughout — its own scoped task. The cheap headers
  (HSTS, nosniff, Referrer-Policy, Permissions-Policy) ship in `vercel.json`.
- **Google Fonts is render-blocking.** Self-hosting via `@fontsource` is a real
  LCP win but changes rendering, which the Phase 1 diff gate deliberately
  forbids. Worth doing as a separate change with its own before/after.
- **`path-to-regexp` advisory** via `@vercel/routing-utils` has no clean fix —
  npm's suggested remedy downgrades `@astrojs/vercel` to a version with an
  unauthenticated path-override vulnerability. It is build-time route
  compilation, not a runtime request path.
