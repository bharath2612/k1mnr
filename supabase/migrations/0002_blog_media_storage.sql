-- ---------------------------------------------------------------------------
-- Storage bucket for post cover images and inline body images.
--
-- Public read (the images are served on a public marketing site), but uploads
-- happen only via the service role inside /api/studio/upload. Anon gets no
-- insert/update/delete path.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blog-media',
  'blog-media',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read of objects in this bucket only.
drop policy if exists blog_media_public_read on storage.objects;
create policy blog_media_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'blog-media');

-- No insert/update/delete policies: writes are service-role only.
