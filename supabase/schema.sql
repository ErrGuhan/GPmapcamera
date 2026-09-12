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

-- =============================================================================
-- Migration Addendum: Domain-Restricted Access (@svcet.ac.in)
--
-- Safe to re-run on existing projects:
-- 1. Rejects any sign-up attempt outside @svcet.ac.in at the database level.
-- 2. Enforces @svcet.ac.in email check on ALL table operations (captures).
-- 3. Enforces @svcet.ac.in email check on ALL storage operations (captures bucket).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Restrict sign-ups to @svcet.ac.in email addresses only
-- ---------------------------------------------------------------------------
create or replace function public.enforce_allowed_email_domain()
returns trigger as $$
begin
  if new.email is null or lower(new.email) not like '%@svcet.ac.in' then
    raise exception 'Only @svcet.ac.in email addresses are allowed to sign up.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_allowed_email_domain_trigger on auth.users;
create trigger enforce_allowed_email_domain_trigger
  before insert on auth.users
  for each row execute function public.enforce_allowed_email_domain();

-- ---------------------------------------------------------------------------
-- 2. RLS Backstop: captures table policies with @svcet.ac.in domain check
-- ---------------------------------------------------------------------------
drop policy if exists "Users can view their own captures" on public.captures;
create policy "Users can view their own captures"
  on public.captures
  for select
  using (
    auth.uid() = user_id
    and (auth.jwt() ->> 'email') ilike '%@svcet.ac.in'
  );

drop policy if exists "Users can insert their own captures" on public.captures;
create policy "Users can insert their own captures"
  on public.captures
  for insert
  with check (
    auth.uid() = user_id
    and (auth.jwt() ->> 'email') ilike '%@svcet.ac.in'
  );

drop policy if exists "Users can delete their own captures" on public.captures;
create policy "Users can delete their own captures"
  on public.captures
  for delete
  using (
    auth.uid() = user_id
    and (auth.jwt() ->> 'email') ilike '%@svcet.ac.in'
  );

-- ---------------------------------------------------------------------------
-- 3. RLS Backstop: storage.objects policies with @svcet.ac.in domain check
-- ---------------------------------------------------------------------------
drop policy if exists "Users can upload to their own folder" on storage.objects;
create policy "Users can upload to their own folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (auth.jwt() ->> 'email') ilike '%@svcet.ac.in'
  );

drop policy if exists "Users can read their own folder" on storage.objects;
create policy "Users can read their own folder"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (auth.jwt() ->> 'email') ilike '%@svcet.ac.in'
  );

drop policy if exists "Users can delete from their own folder" on storage.objects;
create policy "Users can delete from their own folder"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (auth.jwt() ->> 'email') ilike '%@svcet.ac.in'
  );

