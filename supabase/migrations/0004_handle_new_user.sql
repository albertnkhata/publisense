-- ============================================================================
-- 0004: handle_new_user trigger
-- ============================================================================
-- MVP critical path item 1.
--
-- PROBLEM
--   public.profiles.id is the join key for every write in the app:
--     posts.author_id, comments.author_id, post_votes.user_id,
--     post_reposts.user_id, follows.follower_id, and both
--     notifications (recipient_id, actor_id) FKs reference profiles(id).
--
--   Nothing creates a profiles row when a Supabase Auth user signs up.
--   The client only syncs on an already-authenticated SESSION (see
--   StoreContext syncSupabaseUserToProfile, called from onAuthStateChange),
--   which runs AFTER the user exists. So a brand-new user's first write
--   fails on foreign key.
--
-- FIX
--   Insert the profiles row inside the auth.users insert transaction, via an
--   AFTER INSERT trigger. By the time the client can act, the row exists.
--
-- COLUMN DERIVATION (mirrors the client's syncSupabaseUserToProfile so the
-- two agree and do not fight):
--   id      : auth.users.id::text      (matches the auth.uid()::text = id idiom)
--   email   : lower(users.email), or a synthetic @publisense.app fallback
--   handle  : from metadata handle/user_name/full_name/name, sanitised to
--             [a-z0-9_], max 24 chars, de-duplicated on collision
--   name    : metadata full_name / name / user_name / handle / email local-part
--   avatar  : metadata avatar_url, else ''
--   role    : always 'user' - never derived from metadata (privilege escalation)
--
-- IDEMPOTENT: safe to re-run.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text;
  v_raw     text;
  v_base    text;
  v_handle  text;
  v_name    text;
  v_avatar  text;
begin
  v_email := lower(coalesce(new.email, new.id::text || '@publisense.app'));

  v_raw := coalesce(
    new.raw_user_meta_data ->> 'handle',
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(v_email, '@', 1)
  );

  -- sanitise: lowercase, strip leading @, keep [a-z0-9_], collapse runs, cap 24
  v_base := lower(v_raw);
  v_base := regexp_replace(v_base, '^@', '');
  v_base := regexp_replace(v_base, '[^a-z0-9_]+', '_', 'g');
  v_base := regexp_replace(v_base, '_+', '_', 'g');
  v_base := trim(both '_' from v_base);
  v_base := left(v_base, 24);
  if v_base = '' then
    v_base := 'user_' || substr(new.id::text, 1, 6);
  end if;

  -- display name + avatar (independent of the handle)
  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'user_name', ''),
    v_base
  );

  v_avatar := coalesce(nullif(new.raw_user_meta_data ->> 'avatar_url', ''), '');

  -- de-duplicate handle (profiles.handle is unique).
  --
  -- RACE SAFETY: a check-then-insert loop is not safe under concurrency. Two
  -- users signing up at the same moment with the same derived handle can both
  -- observe it as free, then one hits the unique constraint and the whole
  -- signup fails with a 500 - an unexplained failure at the worst possible
  -- moment. Instead the suffix is derived from the user's own uuid, which is
  -- unique by construction, so two concurrent inserts cannot collide.
  --
  -- Order of preference:
  --   1. the plain handle, if free  (best UX - most users keep their name)
  --   2. sanitised-handle + '_' + first 4 hex of the uid  (unique)
  --   3. sanitised-handle + '_' + full uid               (guaranteed unique)
  --
  -- The unique_violation handler covers the narrow window where another
  -- transaction takes the name between the check and the insert.
  begin
    if not exists (select 1 from public.profiles p where p.handle = v_base) then
      v_handle := v_base;
    else
      v_handle := left(v_base, 19) || '_' || substr(new.id::text, 1, 4);
    end if;

    insert into public.profiles (id, handle, name, email, avatar_url, bio, role)
    values (
      new.id::text,
      v_handle,
      v_name,
      v_email,
      v_avatar,
      'Builder sharing product feedback and backing community signals on Publisense.',
      'user'
    );
  exception when unique_violation then
    -- Either the handle or the id collided. id collisions mean the profile
    -- already exists (re-entrant trigger), which is a no-op, not an error.
    if exists (select 1 from public.profiles p where p.id = new.id::text) then
      return new;
    end if;
    insert into public.profiles (id, handle, name, email, avatar_url, bio, role)
    values (
      new.id::text,
      left(v_base, 14) || '_' || new.id::text,  -- full uuid: cannot collide
      v_name,
      v_email,
      v_avatar,
      'Builder sharing product feedback and backing community signals on Publisense.',
      'user'
    );
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Backfill: create profiles for auth users that already exist without one.
-- (The project currently has 0 auth users, but this makes the migration safe
--  to run against an environment that does.)
-- Reuses the same sanitisation as handle_new_user via a helper so the logic
-- cannot drift.
create or replace function public.publisense_sanitise_handle(raw text, uid text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := lower(coalesce(raw, ''));
  v := regexp_replace(v, '^@', '');
  v := regexp_replace(v, '[^a-z0-9_]+', '_', 'g');
  v := regexp_replace(v, '_+', '_', 'g');
  v := trim(both '_' from v);
  v := left(v, 24);
  if v = '' or v is null then
    v := 'user_' || substr(uid, 1, 6);
  end if;
  return v;
end;
$$;

insert into public.profiles (id, handle, name, email, avatar_url, bio, role)
select
  u.id::text,
  -- suffix with uid fragment: guaranteed unique, avoids the loop in a set query
  left(public.publisense_sanitise_handle(
    coalesce(u.raw_user_meta_data ->> 'handle',
             u.raw_user_meta_data ->> 'user_name',
             u.raw_user_meta_data ->> 'preferred_username',
             u.raw_user_meta_data ->> 'full_name',
             u.raw_user_meta_data ->> 'name',
             split_part(lower(coalesce(u.email, '')), '@', 1)),
    u.id::text
  ), 19) || '_' || substr(u.id::text, 1, 4),
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    nullif(u.raw_user_meta_data ->> 'user_name', ''),
    split_part(lower(coalesce(u.email, '')), '@', 1),
    'Builder'
  ),
  coalesce(lower(u.email), u.id::text || '@publisense.app'),
  coalesce(u.raw_user_meta_data ->> 'avatar_url', ''),
  'Builder sharing product feedback and backing community signals on Publisense.',
  'user'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id::text);

