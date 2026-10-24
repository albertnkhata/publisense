-- The rest of the Supabase platform the v2 migrations and tests rely on, for the CI
-- migrations job only (the auth schema itself is stubbed inline in ci.yml). Like that
-- stub, it mirrors Supabase's defaults so policies behave as they do in production:
--   * the API roles can use the auth schema and call auth.uid(), as on Supabase;
--   * a minimal storage schema: just the columns 0018 touches;
--   * Supabase's default privileges on new public tables.
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text,
  owner     uuid,
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;

-- Supabase grants every privilege on new public tables to its API roles by default.
-- Mirror that so 0017's revoke-then-grant is exercised exactly as in production.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
