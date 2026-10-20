# Deferred Decisions Register

> **Purpose.** A single place to record things we deliberately did **not** fix now.
> Each entry is a decision with a known cost and a condition that should trigger
> revisiting it. This exists so nothing gets quietly dropped and nobody has to
> reconstruct why a shortcut was taken.
>
> **How to use this file**
> - Before taking a shortcut, add an entry. If it isn't written down, it isn't deferred — it's forgotten.
> - Re-read before any public launch or deploy.
> - When fixed, **do not delete** the entry. Mark it `✅ RESOLVED`, add the date and the PR/commit, and leave it as a record.
> - Order: open items first, newest at the top of each section. Resolved items at the bottom.
>
> **Status key:** 🔴 blocks deploy · 🟡 ship-with-risk · 🟢 cosmetic/minor

---

## Open

### D-011 · Every visible signal and comment in production is seeded fixture content

**Status:** 🟡 accepted for now (owner decision 2026-10-20) · **Raised:** 2026-10-20 · **Revisit:** before announce

**Decision:** keep the demo content in place while the product is still being
polished. Recorded so the risk is deliberate rather than forgotten — it is not a bug
that got lost, it is a choice that has to be revisited out loud before the app is
shown to anyone outside.

The live site presents eight posts, nine comments and eight profiles as community
activity. **All of it is fixture data.** Verified against production with the anon
key and the service_role key:

```
posts.author_id      -> usr-maya 2, usr-elena 1, usr-jonas 1, usr-lucas 1,
                        usr-marcus 1, usr-noah 1, usr-albert 1   (100% fixtures)
comments.author_id   -> usr-noah 3, usr-maya 2, usr-marcus 1, usr-elena 1,
                        usr-jonas 1, usr-albert 1                (100% fixtures)
auth.users           -> 2 real accounts (both the owner's), 0 real community members
```

The personas are named, avatar'd, and attributed to real-looking domains
(`@systems.dev`, `@anysphere.inc`, …). `usr-albert` even carries `role = 'admin'`,
so the public `public_profiles` view advertises an admin account no human can sign
in to.

**Already mitigated (2026-10-20, migration `0010`):** fixture rows no longer hold
deliverable email addresses — they were moved to `@publisense.invalid`, which also
removed the signup collision that blocked the owner's own address. Fixtures can no
longer be mistaken for real accounts at the database level.

**What keeping them costs:** a headline like "4,120+ community signals" over eight
fixture posts reads as traction that does not exist. The product's central claim —
"see which teams actually listen" — rests on reactions no team ever gave. That is a
truthfulness exposure, not an engineering one, so it is the owner's call.

**Revisit trigger — any of these ends the deferral:**
- a public announcement, launch post, or shareable link outside the owner's circle
- the first time real users are invited
- a screenshot or demo shown to a third party (investor, partner, customer)

**Then choose, in order of honesty:**
- **A** — delete fixtures and shipped seed content; launch on a genuinely empty
  index (requires a decent empty state)
- **B** — keep them, but label them: a visible "sample data" banner and personas
  marked as examples rather than members


---

### D-010 · Claimed boards have no approval path

**Status:** 🟡 ship-with-risk · **Raised:** 2026-10-20 · **PR:** #25 · **Affects:** roadmap 3.1

`claim_product_board(p_product_id, p_work_email)` verifies the work-email domain
server-side and parks the claim as `claim_status = 'pending'`. It deliberately
grants **nothing** — no `role` change, no `managed_org_id`, no verified badge — and
says so in its own contract.

`approve_product_claim(p_product_id)` exists and is gated to admins, but **nothing
in the client calls it and there is no admin screen**. A claim submitted today sits
`pending` forever.

**Deliberate because:** auto-approving on domain match would let anyone with a
`@company.com` address take a board; the human gate is the security property, and
the MVP loop does not require claiming.

**Revisit when:** before claiming is announced to builders. Needs an admin view
listing pending claims plus an approve/reject action, and a decision on whether DNS
TXT verification can replace the human gate.

**The cost:** claiming is honest but inert. Verified live: all 13 products are
`claim_status = 'unclaimed'`; there is no `product_claims` table, the state lives in
`products.claim_status` / `claimed_by` / `claim_email`.

---

### D-007 · Background rows for other users have no email in the client

**Status:** 🟢 cosmetic/minor · **Deferred:** 2026-10-20 · **PR:** #16

`profiles` is no longer publicly readable, because `email` was world-readable.
The feed now reads the **`public_profiles`** view, which omits `email`. The client
was updated to match:

- loader switched to `public_profiles`
- three `p.email.toLowerCase()` lookups guarded against empty strings, which
  would otherwise throw on other users' entries

**What still works:** handles, names, avatars, bios, roles, locations all render.
**What is absent:** `UserProfile.email` is `''` for anyone but the signed-in user.

**Revisit when:** any feature needs another user's email — password reset flows,
admin console lists, or export (including the D-010 claim-review screen, which shows
`products.claim_email` and not a profile email). Those need a `service_role` path or
an admin-only view, not a loosening of `profiles` RLS.

**The cost:** client code cannot rely on `profile.email` being populated for
other users. Guarded at every current call site.

---

### D-005 · Email confirmation disabled; SMTP now configured but mail lands in spam

**Status:** 🟡 ship-with-risk · **Deferred:** 2026-10-20 · **PR:** #15 · **Partially resolved:** 2026-10-20

**What was true at deferral:** `mailer_autoconfirm: true` on `publisense`, and every
SMTP field was empty (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_admin_email`,
`smtp_sender_name` all `None`). With confirmation required, signup returned
`HTTP 200` but **no session**, and no email was ever sent — there was no mailer.
Every new user was stranded permanently unconfirmed. Magic link and password reset
were therefore dead, and a user who forgot a password was locked out forever.

**What changed (2026-10-20):** SMTP is live through Resend —
`smtp.resend.com:587`, user `resend`, sender `Publisense <auth@ridgewoodinsights.com>`
— set via the management API on the `publisense` project, with
`rate_limit_email_sent` raised 2 → 30.

Verified end to end, not inferred: `POST /auth/v1/otp` returned `200` and the mail
**arrived** (`From: Publisense <auth@ridgewoodinsights.com>`, subject
"Your sign-in link", 2026-10-20 19:04 UTC).

**Still open — deliverability.** That message landed in **Gmail spam**. The cause is
visible in DNS: `ridgewoodinsights.com` apex carries `v=spf1 include:zohomail.com ~all`,
while Resend transmits from Amazon SES, so SPF fails for the apex. Resend's own
correct setup already exists on the `send` subdomain
(`send TXT v=spf1 include:amazonses.com ~all`, `resend._domainkey`), but the
available Resend key is scoped to the apex address only and cannot send as
`send.ridgewoodinsights.com`, and it cannot create or verify a new domain.

**To close it, pick one:**
- **A** — verify `publisense.app` in Resend (needs a full-access Resend key; the DNS
  records can then be added to its Vercel zone), sender becomes
  `auth@publisense.app`. This is the right end state: the brand on the envelope
  matches the brand in the body.
- **B** — re-scope the existing Resend key to `send.ridgewoodinsights.com` and send
  from that subdomain (SPF already aligned; one dashboard change, no new DNS).

Until either lands: `mailer_autoconfirm` stays `true` (so nobody is stranded
unconfirmed), and the Magic Link tab stays behind `VITE_AUTH_MAGIC_LINK` (default
`false`) — an email that reliably lands in spam is worse than no email tab.

**The cost of leaving it:** no email verification, anyone can claim an address they
don't own, no password reset, no account recovery.


---

### D-003 · No automated tests for application behaviour

**Status:** 🟡 ship-with-risk · **Deferred:** 2026-10-20 · **Partly addressed:** PR #23

There are still **zero** `*.test.*` / `*.spec.*` files in the repo. Auth, RLS and
the post-creation loop were verified manually against the live project (PR #14, #16,
#24, #25), not by a suite.

**Partly addressed since deferral:** CI now runs, on every PR and on `main`:

- `tsc --noEmit` and `vite build`
- a `service_role` bundle leak guard (`grep` over `dist/assets/*.js`)
- every migration applied in order against Postgres 17 with a faithful `auth` schema stub

That proves migrations apply and the bundle builds. It does **not** prove a user can
sign up, post, or vote — those remain manual, live-only checks.

**Revisit when:** immediately after first deploy (done) — next natural point is
before announce. The signup→post→vote loop is the thing most likely to regress
silently.

**The cost:** regressions in auth or RLS surface only in production.

---

### D-002 · `service_role` key exists with no server-side consumer

**Status:** 🟡 ship-with-risk · **Deferred:** 2026-10-20 · **Trigger met:** 2026-10-20

The `service_role` key is provisioned and stored in the Notion API Keys DB. It
**bypasses all RLS**. Nothing in the app currently needs it — there is no API
route or edge function.

**Deliberate because:** it may be needed for admin operations later.

**Revisit trigger was "when RLS is locked down (D-006)". That has happened** — 32
scoped policies are live. So this is now a decision, not a pending condition:
- **A** — keep it (D-010 claim approval and any admin console will need a
  privileged path; a `service_role` server function or an `is_admin()`-gated RPC)
- **B** — revoke and rotate it, and use admin-gated RPCs only

**The cost:** a live all-powerful credential sitting unused. Verified it is
**not** in the client bundle (CI now fails the build if `service_role` appears in
`dist/assets/*.js`), but blast radius if ever leaked is total.

---

## Resolved

- **D-009** — comment upvoting (PR #24, 2026-10-20). `0008_comment_votes.sql`: a
  `comment_votes` table with `(comment_id, user_id)` as the primary key, mirroring
  the `post_votes` pattern that already worked. `likes_count` is trigger-maintained
  and cannot be written by clients at all. Verified over real HTTP: non-author vote
  201 with count 42→43, duplicate vote 23505, direct `likes_count` write 400 P0001,
  vote as another user 42501, anon vote 42501, unvote 204.

- **D-008** — board claiming (PR #25, 2026-10-20). `0009_claim_product_board.sql`
  adds `claim_product_board(p_product_id, p_work_email)` and
  `approve_product_claim(p_product_id)`, both `SECURITY DEFINER`; the client only
  asks and never writes `role`. Verified: the old direct PATCH still returns 400
  P0001, a matching domain returns `{ok:true, status:'pending'}`, a wrong domain is
  refused with `domain_mismatch`, anon calls get 401 `42501`, and a pending claim
  grants no elevation. The residual gap (nothing approves claims) is now D-010.

- **D-006** — RLS lockdown (PR #16, 2026-10-20). All 17 permissive policies replaced
  with 32 scoped ones. Two bugs found and fixed in `0007`: `42P17` infinite recursion
  on `profiles` (fixed with `SECURITY DEFINER` `is_admin()` / `manages_product()`),
  and self-promotion of `role` (fixed with the `guard_profile_privileges` trigger,
  because a `WITH CHECK` cannot compare OLD to NEW). Verified 11/11 against the live
  project with real GoTrue sessions.

- **D-004** — orphaned pages wired (PR #18, 2026-10-20). `/explore`, `/org/:slug` and
  `/settings` are routed in `App.tsx` and linked from `AppShell.tsx`, and are
  code-split into their own chunks.

- **D-001** — old Firebase build superseded (2026-10-20). V2 is live at
  https://publisense.app (with `publisense.vercel.app` still resolving). The Firebase build at `publisense-app.web.app` still
  serves the pre-Supabase bundle; retiring that GCP project is tracked in issue #7,
  not here.

---

## Related

- [`MVP.md`](../MVP.md) — what must ship, and what is explicitly out of scope
- [`roadmap.md`](../roadmap.md) — phases and open issues
