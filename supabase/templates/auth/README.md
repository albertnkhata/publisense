# Supabase Auth email templates

Branded subjects and HTML for the stock Supabase Auth emails, live in production
since Oct 27, 2026: confirm signup (`confirmation`), magic link (`magic_link`),
reset password (`recovery`), change email (`email_change`) and invite (`invite`).
Reauthentication is not branded: production doesn't require it
(`security_update_password_require_reauthentication` is off), so its stock
template is untouched.

- Edit `scripts/auth-templates/build.py`, not the HTML: every email shares one
  layout. Run `python3 scripts/auth-templates/build.py` to regenerate.
- Push to production with `python3 scripts/auth-templates/apply.py`. It sends
  only these ten keys (five subjects, five bodies) through the Management API.
- Roll back with `python3 scripts/auth-templates/apply.py --rollback`, which
  restores the stock copy saved in
  `supabase/rollback/auth-templates-2026-10-27/original.json`.

Links use `{{ .ConfirmationURL }}`, exactly as the stock templates did, so the
app's `emailRedirectTo` / `redirectTo` flows are unchanged. The expiry line says
1 hour because production `mailer_otp_exp` is 3600 seconds; change both together.
The logo is `https://publisense.app/apple-touch-icon.png` (a PNG, since Gmail and
Outlook don't render SVG); keep that file served from `web/public`.
