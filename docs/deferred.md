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

### D-005 · Email delivery — RESOLVED

**Status:** ✅ **RESOLVED 2026-10-20** · **Deferred:** 2026-10-20 · **PR:** #15

**What was wrong at deferral.** `mailer_autoconfirm: true` and every SMTP field
empty (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_admin_email`, `smtp_sender_name`
all `None`). With confirmation required, signup returned `HTTP 200` but **no
session**, and no email was ever sent — there was no mailer. Magic link and password
reset were dead, and a forgotten password was unrecoverable.

**What was wrong in the middle state.** SMTP was pointed at Resend using a key
scoped to `ridgewoodinsights.com`, sending as `auth@ridgewoodinsights.com`. Mail was
delivered, but Gmail filed every message as **spam**: that apex's SPF is
`include:zohomail.com` (Zoho owns its mail) while Resend transmits through Amazon
SES, so SPF failed for the sender domain.

**How it was fixed — a sending domain the app actually owns.**

1. `publisense.app` added to Resend (region `eu-west-1`) and its four records
   written into the Vercel DNS zone: DKIM at `resend._domainkey`, SPF TXT and
   feedback MX on the `send` subdomain, and the `rsend` return-path CNAME.
   Resend reports `verified` on all four.
2. Supabase SMTP sender moved to `Publisense <auth@publisense.app>`, and — the step
   that matters — `smtp_pass` swapped to the **full-access** Resend key. Changing the
   sender while keeping the old domain-scoped key makes every send fail with
   `500 Error sending magic link email`, because Resend refuses a `from` address the
   key is not authorised for. That looks like an SMTP outage and is not one.
3. `rate_limit_email_sent` raised 2 → 30.

**Verified end to end, by reading the mailbox rather than trusting a 200:**

```
POST /auth/v1/otp {albertnkhata.s@gmail.com}          -> 200
Resend:  2026-10-20 20:34:21  from "Publisense" <auth@publisense.app>  delivered
Gmail:   labels = [INBOX]   (not SPAM)
         dkim=pass header.i=@publisense.app header.s=resend
         dkim=pass header.i=@amazonses.com
         spf=pass (google.com: domain of ... designates ...)
```

Magic link is now enabled in the UI (`VITE_AUTH_MAGIC_LINK=true`) and email
confirmation is back on (`mailer_autoconfirm: false`), so addresses are verified at
signup and password reset works.

**Reversal if the sending domain is retired:** PATCH `/config/auth` with
`smtp_admin_email` + a key authorised for that domain. Do not change the sender
without changing the key.

---

### D-003 · Test coverage is narrow — one module, no user-flow tests

**Status:** 🟡 ship-with-risk · **Deferred:** 2026-10-20 · **Partly addressed:** PR #23, #32

**What exists now.** `npm test` runs a real suite (vitest) over
`src/lib/authCapabilities.ts` — 15 cases covering the rule that caused a production
defect: the modal must advertise only sign-in methods the project can actually
complete, must fail closed to email/password when `/auth/v1/settings` is unavailable,
must not hide password auth, must cache instead of refetching per modal open, and
must keep the demo persona switcher off in production builds. CI runs it between
typecheck and build.

**What still does not exist.** Nothing exercises a user flow against a real backend:
signup → confirmation → session, posted signals, votes, comments, or the RLS rules
underneath them. Those were verified manually against the live project (PR #14, #16,
#24, #25, #29) — real requests, but not repeatable by a machine.

CI proves: migrations apply on Postgres 17 with an `auth` stub, the bundle builds,
`service_role` never reaches `dist/assets`, and the auth-capability logic behaves.

**Revisit when:** before real users depend on sign-up. The honest first slice is a
seeded throwaway user created in a Supabase **branch database**, exercising
signup → post → vote → comment, torn down after the run. Doing it against the
production project is not acceptable — it leaves rows behind.

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
