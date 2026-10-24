-- Local-only platform stub for proving a Publisense logical backup loads into plain Postgres 17.
-- Mirrors the CI auth stub (ci.yml) plus supabase/tests/supabase_stub.sql, plus the
-- pieces the production schema references that CI does not need (pg_net, vault, extensions).
create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(), email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(), email_confirmed_at timestamptz, last_sign_in_at timestamptz);
create table if not exists auth.identities (id uuid primary key, user_id uuid references auth.users(id), provider text, provider_id text, identity_data jsonb, email text, created_at timestamptz);
create table if not exists auth.mfa_factors (id uuid primary key, user_id uuid references auth.users(id));
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
create schema if not exists net;
create table if not exists net._http_response (id bigint, status_code int, content_type text, headers jsonb, content text, timed_out bool, error_msg text, created timestamptz);
create schema if not exists vault;
create table if not exists vault.secrets (id uuid, name text, description text, secret text, created_at timestamptz);
create or replace view vault.decrypted_secrets as select id, name, description, secret as decrypted_secret, created_at from vault.secrets;
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
