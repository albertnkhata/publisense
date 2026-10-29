-- Throwaway account for the browser sign-in smoke (.github/workflows/e2e.yml).
-- Made straight in auth so it is confirmed without an email; the address is on the
-- reserved .invalid domain. e2e_account_delete.sql removes it when the run ends.
-- psql variables: :email, :pw
begin;
-- Sweep leftovers from runs that died before their cleanup step.
delete from auth.users where email like 'e2e-%@smoke.invalid' and created_at < now() - interval '1 hour';

with u as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    :'email', extensions.crypt(:'pw', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Sign-in smoke test"}', now(), now(),
    '', '', '', ''
  )
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  from u;
commit;
