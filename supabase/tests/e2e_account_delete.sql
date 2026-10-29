-- Removes the browser smoke's throwaway accounts (see e2e_account_create.sql).
-- Profile, tokens and sessions go with them through their cascades.
delete from auth.users where email like 'e2e-%@smoke.invalid';
