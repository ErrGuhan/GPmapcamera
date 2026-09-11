-- =============================================================================
-- GPS Map Camera — Supabase Schema
-- Run this entire file in the Supabase SQL Editor:
--   https://supabase.com/dashboard/project/<your-project-ref>/sql/new
--
-- After running this script, manually create the Storage bucket named
-- "captures" in the Dashboard → Storage tab (or via the CLI), then run the
-- Storage policy blocks at the bottom of this file.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table: captures
-- ---------------------------------------------------------------------------
create table if not exists public.captures (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  media_type    text not null check (media_type in ('photo', 'video')),
  storage_path  text not null,          -- e.g. "<user_id>/<timestamp>.jpg"
  latitude      double precision,
  longitude     double precision,
  address_city   text,
  address_region text,
  address_country text,
  captured_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- Index on user_id + captured_at for fast paginated per-user queries
create index if not exists captures_user_id_captured_at_idx
  on public.captures (user_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.captures enable row level security;

-- SELECT: users can only read their own rows
create policy "Users can view their own captures"
  on public.captures
  for select
  using (auth.uid() = user_id);

-- INSERT: users can only insert rows where user_id matches their own uid
create policy "Users can insert their own captures"
  on public.captures
  for insert
  with check (auth.uid() = user_id);

-- DELETE: users can only delete their own rows
create policy "Users can delete their own captures"
  on public.captures
  for delete
  using (auth.uid() = user_id);

-- No UPDATE policy — captures are immutable once written.

-- ---------------------------------------------------------------------------
-- Storage: "captures" bucket
--
-- STEP 1: Create the bucket in the Supabase Dashboard → Storage tab.
--   - Name: captures
--   - Public: OFF  (private bucket — we use signed URLs in the app)
--   - File size limit: 50 MB (adjust as needed)
--   - Allowed MIME types: image/jpeg, image/png, video/mp4 (optional)
--
-- STEP 2: Run the Storage policy SQL below (Dashboard → Storage → Policies,
--   or paste into the SQL editor after bucket creation).
-- ---------------------------------------------------------------------------

-- Allow authenticated users to UPLOAD files into their own folder.
-- Path convention: <user_id>/<filename>
-- The (storage.foldername(name))[1] expression extracts the first path segment.
create policy "Users can upload to their own folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to READ (download / sign) files in their own folder.
create policy "Users can read their own folder"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to DELETE files in their own folder.
create policy "Users can delete from their own folder"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
