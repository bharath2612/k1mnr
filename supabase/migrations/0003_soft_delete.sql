-- Soft delete. Deleting a post from the studio must be recoverable, so rows
-- are retained and stamped rather than removed.
alter table public.blog_posts add column if not exists deleted_at timestamptz;

-- The slug uniqueness constraint has to ignore deleted rows, otherwise a
-- deleted post keeps its permalink reserved forever and the writer cannot
-- recreate a post under the same title.
alter table public.blog_posts drop constraint if exists blog_posts_slug_key;

create unique index if not exists blog_posts_slug_live_idx
  on public.blog_posts (slug)
  where deleted_at is null;

-- Deleted posts must disappear from the public site immediately. Enforced in
-- the policy rather than in application queries so a missed filter cannot
-- resurrect one.
drop policy if exists blog_posts_public_read on public.blog_posts;
create policy blog_posts_public_read on public.blog_posts
  for select to anon, authenticated
  using (
    status = 'published'
    and published_at <= now()
    and deleted_at is null
  );

create index if not exists blog_posts_live_updated_idx
  on public.blog_posts (updated_at desc)
  where deleted_at is null;
