# End-to-end QA: the feedback loop, 2026-10-27 (production)

Run by Hark on Oct 26, 2026, about 22:42 to 23:20 CAT, against https://publisense.app and Supabase project `wyjfgrgxmhumyzwcrywj`. All writes and cleanup were done by **23:12 CAT**, well before the 02:23 CAT scheduled backup and the 03:07 CAT smoke test.

**Pre-write backup:** GitHub Actions run [40398200827](https://github.com/albertnkhata/publisense/actions/runs/40398200827) (workflow_dispatch on `main`, success, started 22:43 CAT).

## Method

- **Fixtures (labelled QA, all deleted afterwards):**
  - The board **"QA Fixture E2E Loop"** (`qa-fixture-e2e`, live, category dev).
  - Three accounts on the reserved `.test` TLD: `qa-e2e-member@`, `qa-e2e-other@` and `qa-e2e-team@publisense.test`. They were created through the Auth admin API with `email_confirm: true`, so no sign-up email was sent.
  - The team claim used the least invasive option: one `membership` row (owner, board scope) plus `board.claimed_at`, set directly in the DB for the fixture only.
  - Nothing was changed in the schema, RLS, auth config or settings.
- **Visual (browser, real Chrome):**
  - Member session: sign in, post, permalink, reload, vote, reply, negative UI checks.
  - Team session: Manage page, official response, status changes, Roadmap and Changelog.
  - A fresh signed-out session: post page, board card, filter, Roadmap, Changelog, Home and Explore.
  - The browser reached publisense.app on the first try tonight.
- **API (not visual):** PostgREST and RPC calls as the real member, other, team and anon JWTs (password grant against the anon key). Plus one rolled-back transaction as the team role, used for cross-board checks so a wrong "allowed" could not touch real boards.
- **Email safety:**
  - Every notification recipient was a QA account. The email functions log `.test` addresses as `skipped / reserved domain`, so Resend was never called.
  - The held queue (`email_log.status='held'`) stayed at 0 throughout.
  - pg_cron job `v2-email-flush-held` was active and ran successfully every 5 minutes (22:50, 22:55, 23:00 …).
  - The fixture board had no followers or hub, so no real user could be notified.

`V` = checked visually in the browser · `A` = checked by API/SQL/curl only · `V+A` = both.

## Totals

**36 checks: 34 pass · 2 fail (both low) · 0 blocked**

## Flow 1: member posts, permalink, reply, vote, errors

| # | Check | How | Result | Evidence / notes |
|---|---|---|---|---|
| 1 | Member signs in (email + password) | V | PASS | "Signed in" toast; account menu shows QA E2E Member / @qa_e2e_member |
| 2 | Post a Feature request to the fixture board | V+A | PASS | Lands on its own `/post/<id>` permalink. API insert returns 201 with `status=open` |
| 3 | Open permalink, refresh, post persists | V | PASS | Title and body survive a browser reload |
| 4 | Upvote persists; toggle off/on | V+A | PASS | 0 → 1 → reload 1 (pressed) → 0 → reload 0 → 1. DB `vote_count=1` |
| 5 | Reply persists; counts match on post page and board card | V+A | PASS | "1 REPLY" after reload. Board card shows 1 upvote · 1 reply |
| 6 | Empty title refused | V+A | PASS (UX note, #171) | UI: Post stays disabled, but no message says why. API: 400 `23514 post_title_check` |
| 7 | Title over 140 characters refused | V+A | **FAIL (low)** #171 | API: 141 characters gives 400. UI: a 175-character paste is **silently cut to 140** with no message (`maxLength` on the composer). The Edit dialog shows an error instead |
| 8 | Whitespace-only title or reply refused | A | **FAIL (low)** #170 | `title: "   "` and reply `body: "   "` both return **201**. The DB checks count untrimmed characters. The UI blocks both |
| 9 | Body over 10,000 / reply over 5,000 / empty reply refused | V+A | PASS | 400 `23514` each. UI: Reply stays disabled while empty (no message) |
| 10 | Invalid post type refused | A | PASS | `wishlist` gives 400 `22P02`. `friction` is a valid type since 0034 |
| 11 | Signed out: post, vote, reply, follow | V+A | PASS | UI: Post feedback, Upvote and the reply box open the "Sign in to Publisense" modal. API: 401 `42501` on every write |
| 12 | Double vote | V+A | PASS | API: second insert returns 409 `23505`, count stays 1. UI: a second click toggles off, never 2 |
| 13 | Vote as another user; vote or reply on a nonexistent post; post to a missing or nonexistent board | A | PASS | 403 `42501` each |
| 14 | Edit or delete someone else's post or reply; delete someone else's vote | V+A | PASS | UI: their ⋯ menu shows only Unfollow / Copy link / Report, and their reply only Reply / Report. API: PATCH/DELETE affect 0 rows, data unchanged |
| 15 | Member can't set `status`, `vote_count`, `hidden_at`, `board_id`, `author_id` | A | PASS | 403 `42501` (column grants) |
| 16 | Edit and delete own post | A | PASS | Edit sets `edited_at`. Delete removes the post; its permalink then 404s for crawlers |
| 17 | Nonexistent permalink | V+A | PASS | UI: "Post not found. It may have been deleted, or the link is wrong." for both a random UUID and `not-a-real-id`. API: `[]` / 400 `22P02`. HTTP: 404 for crawlers, 200 SPA shell for browsers (as designed in #144) |
| 18 | Post rate limit (5 per 10 min) | A | PASS | The 6th post in the window returns 429 `PT429 rate_limited / posts / short` |

## Flow 2: member post → team response → statuses → signed-out view

| # | Check | How | Result | Evidence / notes |
|---|---|---|---|---|
| 19 | Team sees the Manage button and page | V | PASS | Board header says "You manage this board" with Manage. Manage tabs: Triage, All posts, Team, Settings (nothing changed) |
| 20 | Team-only controls show for the team | V | PASS | Post ⋯ menu: Follow post, **Update status**, **Merge duplicate**, Copy link, **Hide post**, Report. **Hide** on every reply |
| 21 | Official team response | V+A | PASS | Pinned at the top with a **"Team"** badge. The author is shown as the board ("QA Fixture E2E Loop"). Toast: "Marked Under review · followers notified". DB: `is_official=true` |
| 22 | Under review → Planned → In progress → Shipped | V+A | PASS | The pill changes each step, and Shipped is the green check pill. The timeline lists Posted plus 4 steps, each "· QA Fixture E2E Loop team". DB: 4 `status_event` rows in order |
| 23 | Everything persists after reload | V | PASS | Official replies, Shipped pill and full timeline |
| 24 | Signed out: post page shows the whole loop | V+A | PASS | Original title and body by @qa_e2e_member, Shipped pill, full timeline, two pinned replies with the Team badge, member reply. No team controls. Anon REST returns the same data |
| 25 | Signed out: board feed card | V | PASS | Card shows title and excerpt, green **Shipped** pill and the team reply preview. The Status = Shipped filter lists it |
| 26 | Signed out: Roadmap and Changelog | V+A | PASS | Roadmap Shipped column (1). Changelog: "1 request shipped / Requests closed" listing the post |
| 27 | Member UI: no team controls | V | PASS | No Manage button. Board ⋯ menu has only Roadmap and Changelog. Post ⋯ menu has no Update status, Merge or Hide. No Hide on the team's replies. `/b/qa-fixture-e2e/manage` shows the gate "Only the QA Fixture E2E Loop team can see this", with no controls |
| 28 | Member API/RPC: team actions rejected | A | PASS | `set_post_status` gives 403 "only the team can change status". `set_post_hidden` and `set_reply_hidden` give 403. `merge_post`, `unmerge_post`, `remove_team_member` and `set_member_role` return `not_allowed`. `release_scope` returns `owners_only`, `claim_board` returns `claimed`. Board settings PATCH changes 0 rows. Self-insert into `membership` and insert into `block` give 403. Official reply gives 403 "only the team can reply officially" |
| 29 | Anon RPC: team actions rejected | A | PASS | `permission denied for function` on `set_post_status`, `set_post_hidden`, `set_reply_hidden` and `merge_post` |
| 30 | Team power is limited to its own board | A (rolled back) | PASS | As the team, on a real board's post: status, hide, official reply and merge are all denied, and the board settings update changes 0 rows. On its own board the settings update changes 1 row |
| 31 | Team hide / unhide | A | PASS | Hidden: anon and other members get `[]`, the author still sees it. Unhide restores it |
| 32 | Team merge / unmerge | A | PASS | `merge_post` returns `ok`. `unmerge_post` restores `under_review`. See the note on merged links below |
| 33 | Status note via RPC | A | PASS | `set_post_status(..., p_note)` stores the note on the `status_event` |
| 34 | No real user notified or emailed | A | PASS | 11 notifications, all to QA accounts. 8 `email_log` rows, all `skipped / reserved domain`. Held queue 0. Flush job succeeding |
| 35 | Fixture visible on Home / Explore while it existed | V | INFO, counted as pass | The QA post showed on Home and the board on Explore for about 25 minutes overnight. Removed at cleanup; the sitemap has no QA URLs |
| 36 | Cleanup restores baseline | A | PASS | See Cleanup |

## Issues opened

| # | Title | Severity |
|---|---|---|
| [#170](https://github.com/albertnkhata/publisense/issues/170) | Whitespace-only post titles and replies are accepted by the API | low |
| [#171](https://github.com/albertnkhata/publisense/issues/171) | Composer silently truncates titles over 140 characters and gives no reason when Post is disabled | low |

No fixes were made and nothing was merged.

## Observations (not failures, worth a decision)

- **Links to merged posts look deleted to the public.** RLS hides merged posts from everyone but the author and the team (0020, by design), so an old shared link or a voter's link shows "Post not found" rather than sending people to the original.
- **Status change plus official reply gives two notifications** (one `status_change`, one `reply`) for a single action in the Update status dialog.
- **The dialog's note becomes an official reply, not a timeline note.** The Shipped note entered in Update status is saved as a second pinned Team reply, and `status_event.note` stays empty. The RPC supports `p_note`, but the UI doesn't use it.
- **Authors can still edit a post after it's Shipped,** so the text can change after the team has responded.
- **The member's view of `/b/:board/manage` is a team gate, not a 404.** Access is correctly denied.

## Blocked

Nothing. The browser reached publisense.app on the first attempt, so every UI check was visual.

## Cleanup

- **Deleted, in one transaction:**
  - The 3 QA users (their sessions, refresh tokens and identities went with them) and their profiles.
  - The fixture board and its membership (unclaimed first, because the last-owner guard needs it).
  - All 10 QA posts, 7 replies, 2 votes, 11 follows, 7 status events, 1 merge record, 11 notifications and 11 `email_log` rows.
- **Baseline restored.** All 28 counters match the pre-run baseline:
  - 3 users / 3 profiles / 4 identities / 7 sessions
  - 30 boards / 6 hubs / 11 posts / 0 replies / 0 votes / 3 follows
  - 0 notifications / 9 notification prefs / 0 status events / 0 memberships
  - 1 `email_log` row, 0 held / 2 platform admins / 30 storage objects
- **Nothing left behind.** A sweep of every `public`, `auth`, `storage` and `private` table with `created_at` found no rows newer than the run start. `/b/qa-fixture-e2e` now returns 404 and the sitemap has no QA URLs.
- **Credentials removed.** The temporary test logins were deleted from the vault and the local key and password files were deleted.
