# Auth Email — Disabled Confirmation (TEMPORARY)

> **Status:** temporarily disabled 2026-10-20. Must be revisited before public launch.

---

## What was changed

`mailer_autoconfirm` set to **`true`** on the `publisense` Supabase project
(`wyjfgrgxmhumyzwcrywj`), which **disables email confirmation** on signup.

Verified: `GET /v1/projects/{ref}/config/auth` → `mailer_autoconfirm: true`.

## Why

**Nothing on the project could send email.** At the time of writing, every SMTP
field was unset:

```
smtp_host:       None
smtp_port:       None
smtp_user:       None
smtp_admin_email: None
smtp_sender_name: None
```

With confirmation required, signup returned `HTTP 200` but **no session token**,
and the confirmation email was never delivered — because there was no mailer to
deliver it. Every new user would be stranded at `confirmed: false`, unable to
log in, with no way to recover.

Disabling confirmation makes signup functional today without pretending email
works.

## Effect

- Signup now returns a session immediately (`access_token`, ~1042 chars)
- New users are auto-confirmed at creation
- No confirmation email is attempted

Verified end-to-end:
```
signup  -> HTTP 200, session issued, uid 81d31900-4f20-45fb-b87b-614176bbb530
profile -> auto-created (handle: looptester, role: user)
post    -> HTTP 201, post-9d9d76e0-c01f-45a7-8c04-955ef7c2a519
```

## What this costs us

- **No email verification.** Anyone can sign up with an address they don't own.
  Combined with world-writable RLS, that means no meaningful identity at all yet.
- **Magic-link sign-in is non-functional** (`signInWithMagicLink` exists in
  `StoreContext` and will silently fail). Do not advertise it.
- **Password reset is non-functional** — no mailer.
- Account recovery has no path. A user who forgets their password is locked out
  permanently.

## What must happen before public launch

This is **MVP critical path item 3**. Choose one:

**Option A — configure SMTP and re-enable confirmation.**
Set `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_admin_email`,
`smtp_sender_name`; then flip `mailer_autoconfirm` back to `false`. Requires a
reputable sending domain with SPF/DKIM or mail lands in spam. Resend is already
used for Ridgewood lead alerts, so it is a sensible candidate.

**Option B — ship without confirmation, deliberately.**
Keep autoconfirm on and accept unverified emails as a known limitation. Only
defensible if email-dependent features (magic link, password reset) are removed
from the UI so users are never offered a path that cannot work.

Either way: **remove the magic-link option from `AuthModal` if email is not
going to work.** Offering a broken login method is worse than not offering it.

## Reversal

```bash
curl -X PATCH \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/wyjfgrgxmhumyzwcrywj/config/auth" \
  -d '{"mailer_autoconfirm": false}'
```

Only do this once SMTP is configured and testable. Otherwise signup breaks again
exactly as it did before.
