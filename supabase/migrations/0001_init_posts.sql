-- ---------------------------------------------------------------------------
-- Industry Insights blog — initial schema
--
-- Security model (important, and deliberately unusual):
--   * The public site reads with the ANON key. Anon may SELECT published posts
--     and nothing else. There are NO write policies for anon/authenticated at
--     all — writes are impossible through the public API by construction.
--   * All writes go through Astro server routes (/api/studio/*) using the
--     SERVICE ROLE key, which is held only in Vercel server env and gated by a
--     signed studio session cookie. There are no end-user accounts.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ============================ posts ========================================

create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),

  slug text not null unique
    constraint blog_posts_slug_format
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) between 3 and 96),

  title text not null
    constraint blog_posts_title_length check (length(title) between 3 and 160),

  excerpt text
    constraint blog_posts_excerpt_length check (excerpt is null or length(excerpt) <= 320),

  body_md text not null default '',

  cover_url    text,
  cover_alt    text,
  cover_width  int constraint blog_posts_cover_width_positive  check (cover_width  is null or cover_width  > 0),
  cover_height int constraint blog_posts_cover_height_positive check (cover_height is null or cover_height > 0),

  tags text[] not null default '{}',

  status text not null default 'draft'
    constraint blog_posts_status_valid check (status in ('draft', 'published', 'archived')),

  published_at timestamptz,

  seo_title       text constraint blog_posts_seo_title_length check (seo_title is null or length(seo_title) <= 160),
  seo_description text constraint blog_posts_seo_desc_length  check (seo_description is null or length(seo_description) <= 320),

  reading_minutes int,
  author_name     text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A published post is not allowed to be missing anything the listing card,
  -- the social preview or the meta description depend on. Enforced here rather
  -- than only in the API so a bad write can never produce a broken live page.
  constraint blog_posts_published_is_complete check (
    status <> 'published'
    or (
      published_at is not null
      and cover_url is not null
      and cover_alt is not null
      and excerpt   is not null
    )
  )
);

comment on table public.blog_posts is
  'Industry Insights blog posts. Written only via service-role through /api/studio/*.';

-- Listing query: published posts, newest first. Partial index keeps drafts out
-- of the index entirely.
create index blog_posts_published_idx
  on public.blog_posts (published_at desc)
  where status = 'published';

-- Studio listing: drafts and published, most recently touched first.
create index blog_posts_status_updated_idx on public.blog_posts (status, updated_at desc);

create index blog_posts_tags_gin on public.blog_posts using gin (tags);

-- ======================== post_redirects ===================================
-- Preserves permalinks when a published post's slug is edited.

create table public.blog_post_redirects (
  old_slug   text primary key,
  post_id    uuid not null references public.blog_posts(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- FK columns need their own index; Postgres does not create one automatically,
-- and without it every post delete does a seq scan here.
create index blog_post_redirects_post_id_idx on public.blog_post_redirects (post_id);

-- ===================== studio_login_attempts ===============================
-- Serverless-safe rate limiting. An in-process counter is useless on Vercel:
-- functions are multi-instance and cold-start constantly.

create table public.blog_studio_login_attempts (
  ip_hash      text primary key,
  window_start timestamptz not null default now(),
  count        int not null default 0
);

-- ========================= studio_audit ====================================
-- With one shared passcode there is no per-user identity, so this table is the
-- only forensic trail available.

create table public.blog_studio_audit (
  id          bigserial primary key,
  action      text not null
    constraint blog_studio_audit_action_valid
    check (action in ('login', 'login_failed', 'publish', 'unpublish', 'delete')),
  post_id     uuid references public.blog_posts(id) on delete set null,
  author_name text,
  ip_hash     text,
  detail      text,
  created_at  timestamptz not null default now()
);

create index blog_studio_audit_created_idx on public.blog_studio_audit (created_at desc);
create index blog_studio_audit_post_id_idx on public.blog_studio_audit (post_id);

-- ========================== triggers =======================================

create or replace function public.blog_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger blog_posts_set_updated_at
  before update on public.blog_posts
  for each row execute function public.blog_set_updated_at();

-- Stamps published_at on the first transition into 'published', and preserves
-- the old permalink whenever a live post's slug changes.
create or replace function public.blog_posts_handle_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'published'
     and new.slug is distinct from old.slug then
    -- Point the old permalink at this post, and make sure the slug we are
    -- moving TO is not itself still registered as a redirect (which would
    -- otherwise create a redirect loop).
    insert into public.blog_post_redirects (old_slug, post_id)
    values (old.slug, new.id)
    on conflict (old_slug) do update set post_id = excluded.post_id;

    delete from public.blog_post_redirects where old_slug = new.slug;
  end if;

  return new;
end;
$$;

create trigger blog_posts_handle_publish
  before insert or update on public.blog_posts
  for each row execute function public.blog_posts_handle_publish();

-- ============================ RLS ==========================================

alter table public.blog_posts                 enable row level security;
alter table public.blog_post_redirects        enable row level security;
alter table public.blog_studio_login_attempts enable row level security;
alter table public.blog_studio_audit          enable row level security;

-- FORCE applies RLS to the table owner too, so only roles with the BYPASSRLS
-- attribute (service_role) can read past these policies.
alter table public.blog_posts                 force row level security;
alter table public.blog_post_redirects        force row level security;
alter table public.blog_studio_login_attempts force row level security;
alter table public.blog_studio_audit          force row level security;

-- The only public read surface. No USING clause references a function, so
-- there is nothing to wrap in a scalar subquery here.
create policy blog_posts_public_read on public.blog_posts
  for select to anon, authenticated
  using (status = 'published' and published_at <= now());

create policy blog_post_redirects_public_read on public.blog_post_redirects
  for select to anon, authenticated
  using (true);

-- Deliberately NO policies on posts for insert/update/delete, and none at all
-- on studio_login_attempts / studio_audit: those tables are service-role only.

-- Defence in depth. Supabase grants table privileges to anon/authenticated by
-- default; RLS already blocks them, but revoking means a future policy added
-- by mistake cannot silently open a write path.
revoke all on public.blog_posts                 from anon, authenticated;
revoke all on public.blog_post_redirects        from anon, authenticated;
revoke all on public.blog_studio_login_attempts from anon, authenticated;
revoke all on public.blog_studio_audit          from anon, authenticated;

grant select on public.blog_posts          to anon, authenticated;
grant select on public.blog_post_redirects to anon, authenticated;
