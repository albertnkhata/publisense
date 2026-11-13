# Overnight QA, 2026-10-25/26 (production)

Run by Hark, about 22:40 to 05:00 CAT, against https://publisense.app and Supabase project `wyjfgrgxmhumyzwcrywj`.
Method: a rolled-back permission suite (165 checks, run as the real `anon`/`authenticated` roles through the Management API, nothing committed), browser runs with four throwaway accounts (`support+qa-{user1,user2,maint,admin}@publisense.app`), curl checks for routing, previews and the sitemap, and a Sentry review.

## Totals

**41 checks: 32 pass · 5 fail (2 fixed and merged) · 2 not built · 2 blocked**

## Results

| # | Area | Item | Result | Evidence / notes |
|---|---|---|---|---|
| 1 | User | Email sign-up + confirm email | PASS | Email from auth@publisense.app arrived in under a minute and the link signs you in |
| 2 | User | Sign in / sign out | PASS | |
| 3 | User | Password reset | PASS | Reset mail, then new password, then sign-in with it |
| 4 | User | Expired or used email link | FAIL (low) | Lands on `/#error_code=otp_expired` with no message. #137 |
| 5 | User | Settings: handle, name | FAIL, fixed | The error stayed after editing, so valid handles looked rejected. #135, fixed in #143, checked on prod. Hyphens aren't allowed by design |
| 6 | User | Settings: avatar upload | PASS | |
| 7 | User | Notification prefs + unsubscribe | PASS | Prefs persist and RLS-scoped. Token unsubscribe works signed out |
| 8 | User | Explore, category chips, search | PASS | |
| 9 | User | Open board / post, Top/New | PASS | Roadmap/Changelog sit in the board's More menu (`?tab=`), not as tabs |
| 10 | User | Add product from GitHub link | PASS | Autofills name, description and logo. Goes to Pending. Dedupe catches the lowercase / trailing-slash link |
| 11 | User | Add product from website link | PASS | Autofills name, description, logo and a company suggestion |
| 12 | User | Write Bug / Feature, edit, delete | PASS | An "edited" marker shows. A deleted post gives "Post not found" |
| 13 | User | Upvote / un-upvote, auto-follow | PASS | Follow stays after un-upvote |
| 14 | User | Replies, one nesting level | PASS | Reply-to-reply flattens to the thread root |
| 15 | User | ⋯ Follow, Copy link, Report | PASS | |
| 16 | User | ⋯ Save | NOT BUILT | Left out by design (PostMenu comment) |
| 17 | User | ⋯ Hide (for oneself) | NOT BUILT | Hide exists for the board team and platform admins only |
| 18 | User | Follow board, All/Following tabs | PASS | |
| 19 | User | Infinite scroll | PASS (code) | `useInfiniteQuery` is in place. Only 11 posts exist, so the feed ends at "You're all caught up" |
| 20 | User | Notifications page + bell | PASS | Badge count, mark read and Mark all as read work |
| 21 | User | Delete account | PASS | Edge Function works. Content shows as "deleted user", the avatar is removed and sign-in is refused |
| 22 | Between users | Reply → notification + email | PASS | One email per thread burst. List-Unsubscribe header present |
| 23 | Between users | Batching, 20/day cap, prefs | PASS | All three behave as written. Opt-out means no email |
| 24 | Between users | Status-change emails | FAIL (medium) | Planned → In progress → Shipped in 1 minute sends only "Planned". The Shipped email is dropped. #145 |
| 25 | Between users | No editing/deleting others' content (UI + API/RPC) | PASS | |
| 26 | Between users | Pending board visible only to creator (+ admins) | PASS | |
| 27 | Between users | Concurrent votes | PASS | 3 parallel committed votes: counter equals rows |
| 28 | Maintainer | Claim by domain proof | BLOCKED (partly) | Code email from notify@ arrives in about a minute. Wrong code is refused. "Too many codes in the last hour" works. The tester couldn't match a code to the right dialog, so the final step ran after server-side pre-verification |
| 29 | Maintainer | Dispute path | PASS | "Report the wrong owner" → admin queue → Reject. The incumbent can't decide |
| 30 | Maintainer | Team add / join / remove | PASS | Remove has no confirm or undo (#142) |
| 31 | Maintainer | Official reply, status, timeline, pill, Roadmap, Changelog | PASS | Non-members can't do any of it |
| 32 | Admin | Review queue approve / reject; reports; hide / unhide | PASS | |
| 33 | Admin | Imported posts show source + original author, no "sample" label | PASS | All 11 have `source_url` + `source_author` |
| 34 | Admin | Regular users kept out of /admin and admin RPCs | PASS | /admin/* returns Not found. Every admin RPC answers `not_allowed` |
| 35 | Cross-cutting | RLS on every public table (anon + authenticated) | PASS with notes | No leaks of private tables. Notes in #139 and #140 |
| 36 | Cross-cutting | 404s | FAIL, fixed | App 404 pages PASS. Crawlers got 200 for missing board/post (soft 404). #136, fixed in #144, checked on prod: now 404 |
| 37 | Cross-cutting | Link previews, sitemap | PASS | og tags per board/hub/post. Sitemap has 53 URLs and leaves out pending boards |
| 38 | Cross-cutting | Basic accessibility | PASS | Focus rings, skip link, dialog Escape and focus return, labels. Minor: #141 |
| 39 | Cross-cutting | No new Sentry errors | PASS | 0 events in 24h (the project has never received one, see Risky) |
| 40 | Cross-cutting | Mobile ~390px layout | BLOCKED | The test browser can't resize and no Chromium build exists for the sandbox. Responsive classes are present but weren't exercised |
| 41 | Cross-cutting | Nightly backup + smoke schedules | FAIL (high) | No scheduled run has ever fired. #146 |

## Issues opened
| # | Title | Severity |
|---|---|---|
| #135 | Settings handle error stays after editing | low (fixed) |
| #136 | Crawlers get HTTP 200 for unknown boards and posts | low (fixed) |
| #137 | Expired or used email links land on home with no message | low |
| #138 | Notification emails lack List-Unsubscribe-Post (RFC 8058) | medium |
| #139 | SECURITY DEFINER helpers still executable by anon via PUBLIC | low (hardening) |
| #140 | Who-voted-what is readable by anyone via the vote table | low (decision) |
| #141 | Invisible Collapse sidebar button is the first focus stop | low |
| #142 | Removing a teammate has no confirmation or undo | low |
| #145 | Quick status changes drop the Shipped email | medium |
| #146 | Nightly backup and smoke schedules did not fire | high |

## PRs
- **Merged:** #143 (clear a profile field's error on edit, with a test), #144 (crawler 404 for missing board/hub/post, with tests). CI green on both, and both checked on production.
- **Left for Albert (issues only, no PR):** #137 (auth flow), #138 and #145 (email sending), #139 and #140 (migration / RLS). #141 and #142 are small UI changes that can wait.

## Risky things noticed
- **No scheduled workflow has ever run** (#146). The 00:30 UTC backup and the 01:00 UTC smoke test didn't fire tonight. Hark started the backup by hand at about 02:40 UTC and it succeeded. The smoke test was left alone.
- **The Sentry project has never received an event.** The DSN is in the bundle, so this is probably just a quiet night, but end-to-end reporting is unverified. Triggering one test error would confirm it.
- **Reply/status emails dropped inside the 15-minute window are discarded,** not sent later as a digest (#145).

## Cleanup
Deleted every QA user, board, post, reply, vote, follow, notification, status event, membership, join request, dispute, report, verified-domain row, domain challenge and `email_log` row. Also removed both QA board logos from Storage (metadata rows; the public URLs now fail) and revoked the QA admin grant. A final count shows 0 QA users, profiles, boards, posts, replies, email_log rows and objects. Totals are back to before the run: 30 boards, 11 posts, 2 platform admins, 0 verified domains. The temporary test logins were removed from the vault.
