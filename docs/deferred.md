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

### D-013 · Password reset and emailed auth links had no recovery path

**Status:** ✅ RESOLVED 2026-10-21 · **Raised:** 2026-10-21

**What was wrong.** Two gaps in the same flow, both invisible until a user hit them:

1. **No password reset at all.** No "Forgot password?" affordance anywhere, and
   `resetPasswordForEmail` was not called anywhere in the client. A user who mistyped their
   password at signup, or simply forgot it, had no recovery path — the only option was a second
   account on a different address.
2. **Emailed links were never consumed.** `mailer_autoconfirm = false`, so signup and recovery
   both depend on an email link, but Supabase sends `?token_hash=…&type=…` links that a plain
   `createClient` (implicit flow) does not consume. The user clicked "confirm", landed on the site
   **signed out**, and had to sign in again — or, for a reset, there was nothing to do at all. A
   spent link (routinely already fetched by a mail scanner) failed silently: the modal just sat
   there offering a password box.

**Fixed.** `src/lib/authRecovery.ts` (pure, 19 tests) plus wiring in `StoreContext`/`AuthModal`:

- forgot-password enters an email-only step, then confirms "link sent"
- `classifyAuthCallback` reads `token_hash`/`type` off the landing URL and `verifyOtp` completes it
  **in-page**: a confirmed signup lands signed in, a recovery link opens a "set new password" step
- a link that will not verify explains itself and offers a resend; the query string is stripped via
  `replaceState` so a reload cannot replay a dead token
- "expired" is only claimed when the provider says expired — `access_denied` alone does not mean
  that, and guessing sends people to the wrong fix
- reset requests return the same message whether or not the address exists, so the form cannot be
  used to enumerate accounts

**Verified** over the built bundle in a real browser: all four landing states (expired code,
malformed token, plain page, forgot-password) produce the intended mode, fields and button, with
the URL cleaned and no password field shown before a session exists.

**Residual, not fixed here:** there is no client-side cooldown on resend, so a user can trip
Supabase's `smtp_max_frequency` (60s) and see a throttle error; `explainSendFailure` now words that
as a wait rather than a failure, but a visible countdown would be better.

---

### D-012 · The Google consent screen shows no app logo

**Status:** 🟢 DEFERRED by owner decision 2026-10-21 — auto-verification bounced twice; not pursuing now · **Raised:** 2026-10-21 · **Revisit:** when a distinctive brand mark exists, or if a sensitive scope forces a review anyway

**Decision.** Stop chasing brand verification for now. The logo does not appear on the consent
screen and that is accepted. What users see is the app name **Publisense** with working
`publisense.app/privacy` and `publisense.app/terms` links, and no unverified-app interstitial —
verified from the anonymous sign-in page. **Nothing user-facing is broken by this.**

**What was tried (so nobody repeats it).**

1. Uploaded `publisense-google-120.png` → **rejected**: does not uniquely represent the brand.
2. Root cause of the *first* bounce was genuine and is now fixed: the site carried **no brand mark
   anywhere** (header was a letter-`P` tile, favicon an unrelated green glyph, no `og:image`), so the
   crawler found zero continuity with the submitted mark. PR #56 made the mark the site's actual
   identity — header, homepage hero, favicon, apple-touch-icon, `og:image`, all served from `/brand/`.
   Verified live: the 120×120 on `publisense.app` is **byte-identical** (SHA-256) to the kit file, so
   continuity is real, not asserted.
3. Re-ran auto-verification → **bounced again**. Continuity alone was not the whole objection.

**The honest read.** The mark is a speech bubble with ascending bars — the generic "messaging app"
glyph. Google's distinctiveness test is about the mark itself, and no amount of site continuity will
make a common glyph unique. The next attempt needs a **distinctive mark** (monogram / custom
lettermark on the indigo field), not another submission of this one.

**Do not appeal.** Google's "Request additional review" path is for *"I believe the issues found are
incorrect."* Two bounces on a generic glyph is not a false positive, and an appeal spends 2–3 business
days to argue a point that would be lost.

**What picking it up requires:** a distinctive 120×120 square PNG/JPG/BMP (≤1 MB), upload at Auth
Platform → Branding in project `publisense-app` (#435845896733), Verify Branding, then **publish
within 7 days** (a passing verification expires). Branding edits are blocked while a verification is
in progress — click **Cancel** if one is still running.

**Trigger to revisit:** commissioning a real brand mark, **or** adding any sensitive/restricted OAuth
scope (verification becomes mandatory anyway, so the logo rides along at no extra cost).

**Already delivered and staying:** the site brand work (PR #56) is independent of Google's verdict and
is live — the site now carries a real mark where it previously had a letter tile and an unrelated
favicon. That improves the product regardless of the consent screen.

---

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

### D-010 · Claimed boards are inert — an approval path no human could reach

**Status:** 🟢 approval path live · **Raised:** 2026-10-20 · **Unblocked + shipped:** 2026-10-21 (#34, #36, #37)

**What the flow does.** `claim_product_board(product, work_email)` is a
`SECURITY DEFINER` RPC. It validates the work email against the product's own domain,
writes `claim_status = 'pending'` and the claimant's id, and changes no privileges:
no role, no organisation ownership. Correct — a request, not a grant.

**What was actually broken.** `approve_product_claim(product)` already existed,
`SECURITY DEFINER`, and it does the right things: verifies the product and its
organisation, promotes the claimant to `maintainer`, binds `managed_org_id`. But it
gates on `profiles.role = 'admin'` for `auth.uid()`, and the only `admin` row in the
database was the seeded demo persona `usr-albert@publisense.invalid` — a fixture with
no auth user behind it that can never sign in.

So this was never a missing-UI problem. **No human account could approve anything**,
which meant every claim request was a dead end no matter what surfaced it. Nothing in
the product had a real administrator.

**Fixed.** Migration `0011_bootstrap_owner_admin.sql` promotes the owner account to
`admin`. It disables `guard_profile_privileges_trg` for exactly one statement, because
the guard correctly refuses role changes by non-admins and therefore also blocks the
creation of the first one — the circularity has to be broken somewhere, and a
reviewable migration with a single email-identified row is the narrowest place.

**Verified against production**, with a throwaway org, product and user:

- claim lands `pending`, product stays unverified, claimant gets no privileges
- the claimant **cannot** approve their own claim (`not_admin`), and the product stays pending
- an admin approval verifies product + organisation, promotes the claimant to `maintainer`, binds `managed_org_id`
- re-approval is **idempotent** (`ok: true`, same values) rather than refused — harmless, but the function should arguably return `already_verified`; noted, not fixed
- everything removed afterwards, counts back to baseline

**Shipped.** Settings carries a claim queue for administrators only: product,
organisation, claimant email and when they asked, oldest first, one Approve action.
Verified end to end against production — a pending claim approved through that screen
left the product `verified`, its organisation verified and the claimant `maintainer`
bound to it, with the queue emptying afterwards.

**A prerequisite bug this surfaced.** Provisioning a `profiles` row on sign-in used to
write `role: 'user'` and `managed_org_id: null` as though they were defaults. They were
overwrites: the profiles read that proves the account already exists is still in flight
on a cold load, so an admin who signed in was silently demoted — their own admin role is
what made the guard permit the change — and a maintainer's organisation binding would
have been rejected invisibly. The client now provisions with `ON CONFLICT DO NOTHING`
and display fields only, then adopts the authoritative row. `profileProvisioningPayload()`
has tests asserting it cannot carry a role or an organisation.

**Decisions are now recorded.** `public.claim_decisions` logs product, action, actor id
and email, an optional note and a timestamp for every approval and rejection. RLS is on,
admin-readable only, and there is no insert/update/delete policy — rows are written inside
the `SECURITY DEFINER` functions, so a decision cannot be forged or erased over the REST
API. Rejection resets the claim to `unclaimed` (board claimable again) rather than adding a
terminal `rejected` status, which would need cooldown and re-request rules nobody has
designed. Approval now refuses a second call with `already_verified` instead of
double-logging one decision. Both functions are revoked from `anon`.

Verified through the live UI, not just the RPCs: declined a real pending claim from
Settings with a reason; the board came back `unclaimed` with every claim field cleared and
unverified, and the decision row carried the reviewer's email and the note.

**The claimant is now told.** Both decisions insert a `notifications` row inside the same
`SECURITY DEFINER` function that decides, so there is no path that decides without telling
or tells without deciding. A rejection carries the reviewer's note — "we said no" with no
reason is the silence this replaced. `notifications.kind` was a checked list that did not
include the new kinds; it was extended rather than reusing `upvote`, so the database still
says what a row means.

This surfaced two defects behind it. The app never read `notifications` at all — it invented
them in browser state — and the catalogue load ran once at mount before Supabase restored
the session, so anything RLS-filtered came back empty. And the read-state write was written
as `void supabase...update(...)`, which sends nothing: a supabase-js builder is lazy and
requires `.then()` or `await`. Verified by spying on fetch during the click — zero requests,
while the same PATCH as that user returned 200 — then `PATCH -> 204` and `is_read = true`
after the fix.

**Requests are acknowledged and routed too.** A valid claim writes `claim_requested` back to
the claimant (stating that reviews are manual, with no invented turnaround) and `claim_pending`
to each admin, so a request no longer waits on someone happening to open Settings. Refused
attempts notify nobody, a repeat submission by the same claimant updates the stored address
without paging admins twice, and the fan-out joins `auth.users` so the seeded admin profile
with no signable-in account is skipped rather than burying real requests. Verified 11/11 in
production, then seen in the bell as the admin: "Claim waiting: … Review it in Settings."

**The claim lifecycle is now emailed.** `pg_net` makes the HTTPS call from Postgres to Resend,
with the key in Supabase Vault (`resend_api_key`) and the send performed by a
`SECURITY DEFINER` trigger function that is revoked from `anon` and `authenticated` — no API
key in the browser and nothing to deploy. Only the four claim kinds are emailed; votes and
comments stay in the app because they are frequent and would train people to ignore the ones
that matter. Reserved domains (`.invalid`, `.test`, `.example`, `localhost`) are skipped so
demo fixtures never bounce, and a recipient with no address is logged `skipped`.

`email_log` records every attempt and `email_delivery` joins pg_net's response, so a 401 or
422 reads as `failed` rather than `queued` forever — a silent send failure is worse than no
email, because the in-app row makes it look delivered.

Delivered and verified: claim requested, claim waiting and claim rejected each arrived in a
real Gmail INBOX with `dkim=pass` and `spf=pass` from `notify@publisense.app`.

Two limits worth stating. The Vault key is **full-access** — a send-only key would be tighter
and swapping it is one `vault.update_secret`. And the migrations CI job runs on stock
Postgres without `pg_net` or `supabase_vault`, so it proves this migration parses and applies
in order but cannot exercise delivery; delivery is verified live instead.

**Still open.** Email is fire-and-forget with no retry: a send that fails after the request is
queued shows as `failed` in `email_delivery` and nothing re-attempts it. Votes, comments and
status changes remain in-app only. The "work email matches the domain" check proves
nothing about mailbox control; it is labelled weak in the function itself and remains a
manual trust decision, which is precisely why the reject path and the note exist.

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

### D-003 · Test coverage is narrow — no automatic user-flow test in CI

**Status:** 🟡 ship-with-risk · **Deferred:** 2026-10-20 · **Partly addressed:** #23, #32, #33

**Covered now.**

- `npm test` — 15 vitest cases over `src/lib/authCapabilities.ts`: a disabled provider
  is never advertised, a failed settings fetch fails closed to email/password, results
  are cached, flags are decoded predictably. Runs in CI.
- `npm run smoke:live` — 14 checks against the live project with a throwaway user:
  signup provisions a plain-user profile, password sign-in returns a session, a user
  can post and vote as themselves, cannot post or vote as somebody else (`42501`),
  cannot double-vote (`23505`), can edit their own profile but cannot promote
  themselves to admin, and cannot delete another user's post. It records a baseline
  count for every table it touches and **fails if the counts do not come back**, so a
  crashed run cannot silently leave residue.
- CI still proves migrations apply on Postgres 17 with an `auth` stub, the bundle
  builds, and `service_role` never reaches `dist/assets`.

**What is still missing.** The smoke test is manual, because it needs the service role
key and CI has no secrets — and because it writes to production, it is a canary rather
than a suite. There is no automated coverage of the comment/repost/follow/notification
paths, no component tests for the pages, and no test database to run any of it against
(Supabase branching is not on the current plan).

**Revisit when:** either the plan allows branch databases, or repo secrets are added so
`smoke:live` can run on a schedule against a non-production project. Until then the
honest statement is: every RLS rule that matters has been verified against production
by hand and by this script, and nothing verifies it automatically.

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
