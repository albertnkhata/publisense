-- Bootstrap the owner account as the first real administrator.
--
-- Why this needs a migration rather than a normal UPDATE:
--
--   public.guard_profile_privileges() refuses any change to profiles.role unless
--   public.is_admin() is true — which is the correct rule, and it is why nobody can
--   promote themselves through the app. But it also means the very first admin
--   cannot be created by the ordinary path: there has to be an admin to make one.
--
--   Until now the only row with role = 'admin' was the seeded demo persona
--   ("albert", usr-albert@publisense.invalid), which has no auth user behind it and
--   can never sign in. So public.approve_product_claim() — which checks
--   profiles.role = 'admin' for auth.uid() — was unreachable by any human, and every
--   claim request was a dead end no matter what the UI did.
--
--   Disabling the guard for the duration of this one statement is the narrowest way
--   to break that circularity. It runs as the migration owner, touches exactly one
--   row identified by verified email, and re-enables the guard immediately.
--
-- This does not weaken the rule: after this runs, role changes still require an
-- admin, and this file changes nothing on a database where the row is already an
-- admin (the WHERE clause makes it a no-op).

alter table public.profiles disable trigger guard_profile_privileges_trg;

update public.profiles
   set role = 'admin'
 where lower(email) = 'albertnkhata.s@gmail.com'
   and role is distinct from 'admin';

alter table public.profiles enable trigger guard_profile_privileges_trg;
