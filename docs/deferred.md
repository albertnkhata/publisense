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
>
> **v1 paths.** v1 was retired at the 2026-10-24 cutover and its code removed. Paths such as
> `src/lib/…`, `npm test` or `npm run smoke:live` in older entries refer to v1 as it stood at
> commit `279a1da`; v2 lives in `web/`.

---

## Open

Nothing open.

---

## Resolved

### D-003 · Test coverage is narrow — no automatic user-flow test in CI

**Status:** ✅ RESOLVED 2026-10-29 · browser sign-in smoke added nightly · **Deferred:** 2026-10-20 · **Partly addressed:** #23, #32, #33, #62 and the v2 page suites · **Last corrected:** 2026-10-25

**Covered now.**

- `npm test` runs in CI on every PR. The count lives in the
  repo-derived block of [`STATUS.md`](../STATUS.md), so it cannot rot in this entry. The suites cover
  page-level behaviour (discovery and search, the admin console, the composer, teams, routing), not only
  library functions.
- CI rebuilds a database from scratch out of `schema.sql` plus every migration, then asserts RLS is on for
  every public table, that no write policy is world-open, and runs the permission and company name-history
  SQL suites as the real API roles.
- The client bundle is grepped for `service_role` on every build.

**Live smoke test (added 2026-10-25).** `supabase/tests/v2_live_smoke.sql` runs every night at 01:07 UTC
against production from `.github/workflows/smoke.yml`, and on every PR against the seeded CI database. It
creates two throwaway users (`.invalid` addresses, so no email is sent) and checks, as the real API roles:
signup provisions a profile and unsubscribe token and no admin rights; anon can read boards and posts but
not tokens, notifications, settings or the email log, and cannot post; a user can post and vote as
themselves but not as someone else, cannot vote twice, cannot set a status or promote themselves, cannot
edit another profile or reply officially; a reply notifies the post author in-app and runs the email path;
counters move. Everything is rolled back. The same job checks the live pages, sitemap, 404 and link preview.

**Browser sign-in smoke (added 2026-10-29).** `e2e/tests/signin.spec.ts` runs nightly at 01:17 UTC from
`.github/workflows/e2e.yml` (and on PRs touching `e2e/`), in headless Chromium against publisense.app. It opens the
sign-in dialog, has the live auth server refuse a wrong password (a `.invalid` address, so no account or email), and
follows Continue with Google to Google's page with our OAuth client, failing on a Google OAuth error. It then signs
in for real with a throwaway account made for that run only, directly in the database (confirmed, `.invalid`
address, no email) and deleted when the run ends (`supabase/tests/e2e_account_*.sql`).

**Not automated, by choice.** Completing Google's consent and clicking an emailed link need a real Google account and
inbox; those stay manual.

---

### D-007 · Background rows for other users have no email in the client

**Status:** ✅ RESOLVED 2026-10-29 · no longer applies since the v2 rebuild · **Deferred:** 2026-10-20 · **PR:** #16

**Outcome.** v2 has no client-readable email for anyone but the signed-in user, by design: the `profile` table (`0016_v2_schema.sql`) has no email column, `public_profiles` and the v1 `profiles` table were dropped in `0023_drop_v1.sql`, and the client's only email is the viewer's own, from the auth session. No code reads another user's email. The guidance below still holds: a feature that needs one gets a `service_role` path or an admin-only view. The v1 history is kept for reference.

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

### D-012 · The Google consent screen shows no app logo

**Status:** ✅ RESOLVED 2026-10-29 · Google approved the branding after a reply to Trust & Safety from the Verification Center · **Raised:** 2026-10-21 · **Deferred:** 2026-10-21

**Outcome.** The live consent screen for client `435845896733-niul…` now shows the Publisense logo and `support@publisense.app` (checked 2026-10-29). The history below is kept for reference; its "do not appeal" advice was overtaken — the review went through once the Trust & Safety thread was answered.

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

### D-015 · Replies have no edit window

**Status:** ✅ RESOLVED 2026-10-28 · decision #181 (approved by Albert 2026-10-28) · **Deferred:** 2026-10-27 · **PR:** feedback-loop polish (follow-up to the QA report in #172) · **Fix:** migration `0051_v2_reply_edit_rules.sql`

Posts now lock for their author 1 hour after posting and once Shipped, Closed or Merged
(`0045_v2_post_edit_window.sql`, enforced by a trigger). Replies were left as they were: an author can
still edit their own reply at any time, and it shows "edited". A reply is a conversation turn rather
than the record the team answers, and nobody asked for a reply lock, so the change was kept to posts.

**Revisit when:** people edit replies to change their meaning after others answered them, or a team
asks for it. The same pattern applies: a BEFORE UPDATE trigger on `reply` reading
`public.v2_post_edit_window()` (or its own setting).

**Resolution (2026-10-28).** A BEFORE UPDATE trigger on `reply` (0051): community replies are
editable by their author for `public.v2_post_edit_window()` (1 hour, shared with posts); official
team replies are author-only and exempt from the window while the post is open; every reply locks
once the post is Shipped, Closed or Merged (hints `edit_window_closed` / `edit_locked_status`). No
team edits of someone else's reply; deleting is unchanged. The reply's Edit is disabled with the
reason. Test: `supabase/tests/v2_reply_edit_rules_test.sql`.

**Follow-up (2026-10-28, approved by Albert 07:39 CAT).** Official team replies are editable only
while their author is still a current member of the board's team (board or hub membership), via
the same trigger function (`0053_v2_reply_edit_team_member.sql`, hint `edit_not_team_member`).
Leaving or being removed locks their old official replies; rejoining restores editing. Deleting is
unchanged (a former member can still delete their own official reply; changing that would be an
RLS change and was left to Albert). Edit shows disabled with "Only current team members can edit
team replies". Test: `supabase/tests/v2_reply_team_edit_test.sql`.

---

### D-011 · Every post in production is imported from a public source, and nothing says so

**Status:** ✅ RESOLVED 2026-10-25 · decision: **no separate label** — every post already links to its source and names who wrote it · **Raised:** 2026-10-20 · **Last verified:** 2026-10-25

**Decision.** Keep the imported posts and add no "sample" marker. Each one shows an outbound link to where
it came from and the handle of the person who wrote it (`@jeff_weinstein on X ↗`), and the owner's call on
2026-10-25 is that this is disclosure enough — the index does not need to announce itself as a demo on top
of that.

**What production holds**, re-verified 2026-10-25T09:59Z against `wyjfgrgxmhumyzwcrywj`:

```
post          -> 11 total · 11/11 carry source_url and source_author · 0/11 have an author_id
                 (imports, not submissions) · spread over 3 boards
vote          -> 0
reply         -> 0
profile       -> 3, all owner accounts · the seven fictional personas are gone
membership    -> 0
post.platform -> 8 unset · 2 ios · 1 desktop
```

**Why this closes instead of staying deferred.** The exposure recorded on 2026-10-20 was invented traction:
eight posts, nine comments and four votes written by seven fabricated personas, one of them an admin account
no human could sign in to. None of that survives. What is left is eleven imports, each credited and linked,
with no votes, no comments and no members to mistake for a community — and a reader who follows any credit
lands on the original. The `profile` table has also lost its `email` column entirely, which supersedes the
`@publisense.invalid` mitigation from migration `0010`.

**Label considered and rejected.** A visible "sample" marker on imported posts was scoped in #111 and
dropped the same day: the credit line already carries the disclosure, and repeating it on every card would
be noise. #111 was closed unbuilt.

**What would reopen it:** imports that stop carrying a source link or attribution, votes or comments that
manufacture activity around them, or any claim of community volume made over them. The ledger prints the
imported-versus-member split on every refresh for exactly that reason.

---

### D-002 · `service_role` key exists with no server-side consumer

**Status:** ✅ RESOLVED 2026-10-24 · decision **A (keep it)** · **Deferred:** 2026-10-20 · **PR:** #77 (v2 step 4, Auth and account)

**Decision.** Keep the key, and give it exactly one consumer: the `delete-account` Supabase
Edge Function (`supabase/functions/delete-account/`), as FOUNDATION section 12 planned. Every
other privileged path stays an `is_platform_admin()`-gated `security definer` RPC; nothing else
holds the key.

**How it is contained.**

- The key is read from the function's runtime environment (`SUPABASE_SERVICE_ROLE_KEY`, injected
  by Supabase). It is not in the repo, not in any `VITE_` variable, and the CI bundle guard
  (`grep service_role dist/`) still runs on both the v1 and v2 builds.
- The function verifies the caller's JWT with the auth server before doing anything, acts only
  on the caller's own user id, refuses while the caller is the sole owner of a board or hub (the
  `v2_guard_last_owner` trigger refuses the cascade too) or the last platform admin, removes the
  caller's avatar objects through the Storage API, then calls `auth.admin.deleteUser`.
- `supabase/tests/v2_rls_test.sql` checks what that delete does to the v2 tables: profile, token,
  prefs, votes, follows and memberships go; posts and replies stay with a null author; a sole
  owner's delete is refused.

**Still to do outside the code.** Deploy it (`supabase functions deploy delete-account
--project-ref wyjfgrgxmhumyzwcrywj`, JWT verification on). Until then the Settings delete
button answers with a failure message and nothing is deleted. Rotating the key is unaffected:
the function reads it at runtime.

**The original entry, kept as the record:**

> The `service_role` key is provisioned and stored in the Notion API Keys DB. It **bypasses all
> RLS**. Nothing in the app currently needs it: there is no API route or edge function. Options
> were **A** keep it (admin operations will need a privileged path) or **B** revoke and rotate it
> and use admin-gated RPCs only. The cost: a live all-powerful credential sitting unused.

---

### D-014 · A reset link signs you in but never lets you set a password

**Status:** ✅ RESOLVED 2026-10-22 · **Raised:** 2026-10-21 · **Issue:** #61 (closed) · **PR:** #62 · **Attempts:** #59, #60 (failed, reverted)

**What happens.** Click the emailed reset link and you are signed in, on the feed, with no
"choose a new password" step. The password you have forgotten is still the password. Confirmed
on production with freshly minted links, repeatedly, as the first and only consumer of each
token.

**Mechanism.** The link 303s to `https://publisense.app#access_token=…&type=recovery`.
`supabase-js` consumes that fragment during client initialisation and signs the user in, then
clears it. Two things then fail:

1. Nothing durable remembered *why* the user arrived, so no step opened.
2. Even a step that did open could be shut a tick later: `onAuthStateChange` closed the modal on
   the session, and the events arrive in whatever order initialisation and storage produce.

**Three earlier attempts, all falsified by a live test, all reverted:**

1. Guarded `setIsAuthModalOpen(false)` with `event !== 'PASSWORD_RECOVERY'` (#59). Inert — the
   modal had never been opened, so there was nothing to keep open.
2. Read `classifyAuthCallback` at module scope in `StoreContext` (#60). Too late in practice.
3. Captured `window.location.href` in `lib/supabase.ts` **above** `createClient` (#60). Ordering
   verified byte-close in the shipped bundle (capture 23646, client 23853) — and production
   still logged in with no password field.

**Fixed in #62 — the mechanism is observed from inside the client, not from the URL afterwards.**

- `lib/supabase.ts` passes `detectSessionInUrl` as a *function*. auth-js calls it during
  initialisation, while the redirect params are still readable, so `type=recovery` is recorded at
  the only moment it is guaranteed to exist. The function returns auth-js's own predicate
  unchanged, so which URLs the client consumes is untouched.
- The same module subscribes to `onAuthStateChange` immediately after `createClient` (module
  scope, before React mounts) and marks the signal on `PASSWORD_RECOVERY` — belt and braces, and
  the only signal that survives the fragment being cleared.
- `lib/recoverySignal.ts` holds the flag. `StoreContext` reads it on mount *and* subscribes, so
  neither a mark that lands before mount nor one that lands after is missed.
- `AuthModal` renders the "choose a new password" panel **ahead of** the signed-in account panel.
  This was a second, independent reason the step never appeared: a recovery session sets
  `currentUser`, and the account panel was rendering instead of the password field.
- `shouldCloseAuthModalOnAuthEvent(event, pending)` decides dismissal. A name-only guard is not
  enough — `INITIAL_SESSION` can land *after* `PASSWORD_RECOVERY`, and on that ordering the modal
  the recovery just opened gets closed with nothing to reopen it. Observed live: one click of the
  same build showed no password field, the next showed the panel; the differing factor was the
  event order.

**Corrections to the earlier record** (so the next session does not inherit a wrong model):

- **The fragment is still there at module evaluation.** An instrumented build logged, in the real
  browser: `module-eval` at t=675 ms with the full `#access_token=…&type=recovery` hash,
  `detectSessionInUrl(type: recovery)` at t=681. The earlier conclusion that "the fragment is
  consumed before even a top-of-module capture runs" is **not supported** — attempt (3) must have
  failed for another reason (most likely the modal being closed by the session event).
- **A recovery token can be driven at a non-production origin.** `POST /auth/v1/recover` ignores a
  body `redirect_to` (the mail still pointed at `publisense.app`), but the **verify URL** honours
  it: `/auth/v1/verify?token=…&type=recovery&redirect_to=http://localhost:5173` 303s to that
  origin when it is allow-listed (`http://localhost:5173` already is). That is how #62 was proven
  end to end before merging — see below.
- A **synthetic** `#access_token=fake…` fragment is still useless as proof: the session fails to
  be created, auth-js never clears the hash (because clearing happens after a successful
  `GET /user`), and the app's old URL-based branch then opens the modal anyway. It passes on
  broken code.

**Evidence for #62.**

- Local gates: typecheck, `npm test` (96 cases, 26 new), build, and the `service_role` bundle guard
  all pass. The new integration test drives the **real** `@supabase/auth-js` the app ships, with
  our exported client options and a stub transport, and asserts: the client clears the fragment,
  the params hook marks the signal before that, an early listener catches `PASSWORD_RECOVERY`,
  and neither a plain visit nor a `magiclink` redirect is mistaken for a recovery.
- Live, before merge: throwaway confirmed user → real reset mail from `auth@publisense.app` →
  browser as first and only consumer of the token → landed on the built bundle at the allow-listed
  `http://localhost:5173` → **NEW PASSWORD panel appeared**, password accepted, confirmation
  panel shown, `USER_UPDATED` did not dismiss it → `POST /auth/v1/token?grant_type=password`
  returned **200 with the new password and 400 `invalid_credentials` with the previous one**.

**Confirmed on production, 2026-10-22.** One clean reset on `https://publisense.app`, requested
through the app's own "Forgot password?" panel, link opened in the browser as its first and only
consumer:

```
mail          "Reset your password" from auth@publisense.app
panel         input[type=password] present, "NEW PASSWORD", "Your reset link worked"
submit        accepted → "Password updated. You are signed in…"
API sign-in   200 with the new password / 400 invalid_credentials with the old one
UI sign-in    signed in as the throwaway account with the new password
```

Throwaway account and mailbox deleted afterwards (`select count(*) from auth.users where email like
'prodreset%'` → 0).

**Deployment note.** The merge commit's own production build was refused by Vercel's Hobby
build-rate limit (100 deployments/24h, `upgradeToPro=build-rate-limit`), so the live deployment
(`dpl_8xn9JcAivpCCaHC2bjPFSh6jSba6`) was promoted from the PR-head build. That is safe **here and
only because it was checked**: `git diff a4b4501 81de0a9` is empty (identical trees), the artifact
bakes the production Supabase project (`wyjfgrgxmhumyzwcrywj`), and no build-time flag differs —
`VITE_SHOW_DEMO_PERSONAS` is not set in the project at all. Promoting a preview is otherwise the
trap described in the ops notes: it ships whatever commit that preview was built from.

**Spend live links carefully.** Each is single-use; a mail scanner or a `curl -D -` burns it.
Send the browser straight at the link and read the resulting state.

---

### D-013 · Password reset and emailed auth links had no recovery path

**Status:** ✅ RESOLVED 2026-10-22 · **Raised:** 2026-10-21 · **PR:** #58, #62 · **Reopened as D-014** (issue #61, closed by #62)

> **Closed 2026-10-22.** The affordances below were only half the story: they shipped in #58, but a
> real mailed link still signed the user in without offering a new password. That gap is `D-014`,
> fixed in #62 and confirmed on production — the reset now completes. Read on as the record of how
> the reset UI was built.


**What was wrong.** Two gaps in the same flow, both invisible until a user hit them:

1. **No password reset at all.** No "Forgot password?" affordance anywhere, and
   `resetPasswordForEmail` was never called. A user who mistyped their password at signup, or
   forgot it, had no recovery path — the only option was a second account.
2. **Emailed links never completed.** `mailer_autoconfirm = false`, so both signup and recovery
   depend on a mailed link, but nothing consumed it.

**The second one was worse than it looked, and a live round-trip is what found it.** Supabase
mails `/auth/v1/verify?token=…&type=recovery`, which **303-redirects with the session in the URL
fragment** (`#access_token=…&type=recovery`); `supabase-js` consumes that itself. The first
implementation assumed a `?token_hash=` link and read only search params — so a real reset landed
the user **signed in with no way to choose a new password**, and a spent link failed silently.
Unit tests and DOM probes passed on that wrong model; only a real email exposed it.

**Fixed.** `src/lib/authRecovery.ts` (pure, 22 tests) plus wiring in `StoreContext`/`AuthModal`:

- forgot-password → email-only step → "link sent"
- a fragment session is its own case: `type=recovery` opens the **New Password** step, hash cleared
- the `?token_hash=` branch is kept for projects configured that way (`verifyOtp` path)
- a link that will not verify explains itself and offers a resend; reload cannot replay a spent token
- "expired" is claimed only when the provider says expired — `access_denied` alone is not proof
- reset requests answer identically whether or not the address exists (no account enumeration)

**Verified against a real mailbox** (throwaway address), not just an API 200:

```
signup  -> 200, confirmation_sent_at set
mail    -> "Confirm your email address"  from auth@publisense.app   arrived
recover -> 200
mail    -> "Reset your password"         from auth@publisense.app   arrived
reset   -> link followed, password changed
        -> sign-in OLD password 400 REJECTED / NEW password 200 ACCEPTED
```

**Residual, not fixed here:**

- no client-side resend cooldown, so Supabase's 60s `smtp_max_frequency` can be tripped
  (`explainSendFailure` now *words* it as a wait; there is no countdown)
- the 303 hop itself could not be exercised against a local build — `redirect_to` is pinned to the
  allow-listed site URL — so the final UI check used the fragment form directly
- **a mail scanner fetching the link consumes the token**, which is why "expired or already used"
  will sometimes be shown to a user who never clicked anything

---

### D-010 · Claimed boards are inert — an approval path no human could reach

**Status:** ✅ RESOLVED 2026-10-21 · **Raised:** 2026-10-20 · **Shipped:** #34, #36, #37 · **Verified:** approval, rejection, decision log and claimant notification exercised end to end in production

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

- [`MVP.md`](./archive/MVP.md) — what must ship, and what is explicitly out of scope
- [`roadmap.md`](./archive/roadmap.md) — phases and open issues
