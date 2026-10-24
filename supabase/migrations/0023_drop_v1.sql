-- 0023 · v2 step 9: drop v1 (tables, views, functions, signup trigger).
--
-- ⚠️  WRITTEN, NOT APPLIED. Apply to production only at step C4 of docs/v2/CUTOVER.md:
--     after a fresh backup is verified and after publisense.app serves v2. v1's SPA reads
--     these tables, so dropping them while v1 is still on the domain breaks the live site.
--
-- What it removes (production row counts on 2026-10-24, all in the backup):
--   organizations 7 · products 13 · profiles 10 · posts 8 · post_votes 4 · post_reposts 1
--   comments 9 · follows 5 · comment_votes 0 · notifications 0 · claim_decisions 0
--   views public_profiles; trigger on_auth_user_created (v1 signup → public.profiles)
--   v1 functions: handle_new_user, guard_profile_privileges, publisense_sanitise_handle,
--   is_admin, manages_product, claim_product_board, approve_product_claim,
--   reject_product_claim, send_notification_email, sync_comment_likes_count,
--   guard_comment_likes_count.
--
-- What it keeps on purpose:
--   * public.email_log and public.email_delivery. Created by v1 (0015), but v2's
--     v2_send_code (0021) writes every domain-code email attempt to email_log, so they
--     are shared infrastructure now. Their admin policy used v1's is_admin() (which
--     reads v1 profiles.role); it is replaced with is_platform_admin(), and the broad
--     default grants (anon had every privilege, held back only by RLS) are narrowed.
--   * The ci_probe schema (a leftover copy of v1 from CI probing). Not v1 product data
--     and not touched here; dropping it is a separate owner decision (CUTOVER.md).
--
-- No CASCADE anywhere: if anything unexpected still depends on a v1 object, the drop
-- fails loudly and the whole migration rolls back.

begin;

-- 1. Signups: only v2's trigger may remain on auth.users. v1's inserts into
--    public.profiles, which is about to go.
drop trigger if exists on_auth_user_created on auth.users;

-- 2. email_log stays (v2 writes to it). Re-point its admin read at v2's platform admins
--    and stop granting the API roles more than they use.
drop policy if exists "email log admin read" on public.email_log;
create policy "v2 email log platform admin read" on public.email_log
  for select to authenticated using (public.is_platform_admin());
revoke all on table public.email_log from anon, authenticated;
grant select on table public.email_log to authenticated;
do $$
begin
  if to_regclass('public.email_delivery') is not null then
    revoke all on table public.email_delivery from anon, authenticated;
    grant select on table public.email_delivery to authenticated;
  end if;
end $$;

-- 3. v1 views, then tables (dependents first; their triggers go with them).
drop view if exists public.public_profiles;

drop table if exists public.comment_votes;
drop table if exists public.comments;
drop table if exists public.post_votes;
drop table if exists public.post_reposts;
drop table if exists public.notifications;
drop table if exists public.claim_decisions;
drop table if exists public.follows;
drop table if exists public.posts;
drop table if exists public.products;
drop table if exists public.profiles;
drop table if exists public.organizations;

-- 4. v1 functions (none is referenced by a v2 object; checked against production).
drop function if exists public.handle_new_user();
drop function if exists public.guard_profile_privileges();
drop function if exists public.publisense_sanitise_handle(text, text);
drop function if exists public.sync_comment_likes_count();
drop function if exists public.guard_comment_likes_count();
drop function if exists public.send_notification_email();
drop function if exists public.approve_product_claim(text);
drop function if exists public.reject_product_claim(text, text);
drop function if exists public.claim_product_board(text, text);
drop function if exists public.manages_product(text);
drop function if exists public.is_admin();

-- 5. Prove the end state, or roll everything back.
do $$
declare v_left text;
begin
  select string_agg(c.relname, ', ') into v_left
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('organizations', 'products', 'profiles', 'posts', 'post_votes',
                       'post_reposts', 'comments', 'follows', 'notifications',
                       'comment_votes', 'claim_decisions', 'public_profiles');
  if v_left is not null then raise exception '0023: v1 relations still present: %', v_left; end if;

  if exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
              and tgname = 'on_auth_user_created') then
    raise exception '0023: v1 signup trigger still on auth.users';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
                  and tgname = 'v2_on_auth_user_created') then
    raise exception '0023: v2 signup trigger missing; v2 signups would get no profile';
  end if;
  if to_regclass('public.email_log') is null then
    raise exception '0023: email_log must survive (v2_send_code writes to it)';
  end if;
end $$;

commit;
