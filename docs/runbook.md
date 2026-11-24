# Launch-day support and incident runbook

Operational runbook for Publisense (`publisense.app`) covering the 72-hour launch response window (#317) and ongoing production incidents (#320).

---

## 1. Responders and launch coverage

| Role | Owner | Primary contact | Backup / fallback |
| :--- | :--- | :--- | :--- |
| **Primary responder & Incident Commander** | Albert Nkhata | `support@publisense.app` · `@publisensehq` | Direct phone / SMS (stored offline) |
| **Backup responder** | _Assign before launch day (name + contact stored offline)_ | _Phone / WhatsApp / Signal_ | Escalate via GitHub issue (`severity:p0`) + email |

### 72-hour launch response window (#317)
- Starts at Show HN + X posting (~16:00 CAT on the active launch date from #317) and runs for 72 hours.
- **Active monitoring cadence:** check `/admin` Command Centre, `/admin/reports`, `/admin/disputes`, `support@publisense.app`, Sentry (`publisense-web`), and launch threads (Show HN, X, Product Hunt) every 30 minutes during waking hours; keep phone notifications on for P0/P1 alerts.
- **Pause / resume authority:** Only the **Primary responder (Albert)** (or designated Backup responder if Primary is unreachable during a P0) may pause or resume launch outreach/promotion, post incident status updates, or execute a production rollback.

---

## 2. Support intake, triage, and severity

### Intake channels
1. **Email:** `support@publisense.app` (also the `reply_to` address on every notification, claim, and digest email).
2. **In-app moderation queues:** `/admin/reports`, `/admin/disputes`, `/admin/products`, `/admin/companies`.
3. **Public social & launch threads:** Show HN comments, `@publisensehq` mentions/DMs on X, Product Hunt comments.
4. **Automated monitors:**
   - GitHub Actions: `Live smoke test` (`smoke.yml`), `Browser sign-in smoke` (`e2e.yml`), `Nightly backup` (`backup.yml`).
   - Sentry: `publisense-web` client error alerts.
   - Vercel & Supabase dashboards.

### Triage steps (first 5 minutes)
1. **Reproduce or confirm scope:** open `https://publisense.app` in an incognito window; check `gh run list --limit 5` or trigger `Live smoke test` (`gh workflow run smoke.yml`).
2. **Classify severity** using the table below.
3. **Log the incident** (P0/P1/P2) in the Incident Log (Section 6) or a dedicated GitHub issue labelled `incident`.
4. **Mitigate first, root-cause second:** stabilize user-facing functionality (rollback, toggle, or manual unblock) before writing a permanent fix.

### Severity & escalation

| Level | Definition | Target first response | Update cadence | Escalation |
| :--- | :--- | :--- | :--- | :--- |
| **P0 — Critical** | Site unreachable, auth completely broken, data loss/corruption, or security/RLS leak | ≤ 15 min | Every 30 min until resolved | Pause launch promo immediately; execute rollback; alert backup responder |
| **P1 — High** | Core flow degraded (posting, voting, claiming, email delivery failing, major 500s) | ≤ 30 min | Every 60 min | Reproduce, isolate (Vercel vs Supabase vs Resend), patch or rollback |
| **P2 — Medium** | Non-blocking UI bug, single-board issue, delayed email batching, bad OG preview | ≤ 4 hours | Once fixed | Triage into GitHub issue; ship normal fix via CI |
| **P3 — Low** | Feature question, minor copy tweak, cosmetic polish | ≤ 24 hours (within 72h window) | Reply directly | Log in Publisense's own board or GitHub issues |

---

## 3. Incident playbooks (safe response steps)

### A. Sign-in and email delivery issues
- **Symptoms:** Users report magic/confirm/reset emails not arriving, Google OAuth failing, or claim codes missing.
- **Check:**
  1. Trigger `Browser sign-in smoke`: `gh workflow run e2e.yml`.
  2. Check Supabase Dashboard → **Authentication → Logs** and **SMTP** (`auth@publisense.app`).
  3. Check **Resend** dashboard for `send.publisense.app` / `notify@publisense.app` bounces, rate limits, or suppressed recipients.
  4. Inspect `public.email_log` (read-only query in Supabase SQL Editor) for `status = 'error'` and `detail`:
     ```sql
     select created_at, kind, status, detail
       from public.email_log
      order by created_at desc
      limit 30;
     ```
  5. Verify `pg_cron` jobs (`v2-email-flush-held`, `v2-dm-email-flush`, `v2-weekly-digest`) in `cron.job_run_details`:
     ```sql
     select j.jobname, d.status, d.return_message, d.start_time
       from cron.job_run_details d
       join cron.job j on j.jobid = d.jobid
      order by d.start_time desc
      limit 20;
     ```
- **Safe mitigation:**
  - If Resend hits a temporary spike, held notification emails remain safely queued and flush automatically every 5 minutes once Resend recovers; weekly digests (`v2_weekly_digest_send`) retry errored rows automatically on the next Monday window run.
  - If Google OAuth fails while email auth works, post a brief note on the launch thread advising email sign-in while checking Google Cloud OAuth consent/redirect settings.

### B. Board and hub claims
- **Symptoms:** A founder cannot verify their work email or DNS TXT record, hits the claim rate limit, or reports an unauthorized claim.
- **Check:**
  1. Check `/admin/disputes` and `/admin/products` (is the product pending review or missing the founder's company domain?).
  2. Check `email_log` for claim code delivery errors.
  3. For DNS verification, verify the TXT record externally (`dig +short TXT _publisense.<domain>`).
- **Safe mitigation:**
  - Never bypass domain ownership proof by hand without verifying the requester's identity on the official company domain or verified social handle.
  - For an unauthorized claim, use `/admin/disputes` (or revoke team ownership in `/admin`) and notify the rightful team via `support@publisense.app`.

### C. Posting, replies, and DMs failing
- **Symptoms:** 400/403/500 errors on post creation, replies, voting, or DMs.
- **Check:**
  1. Check Sentry (`publisense-web`) for the failing RPC or PostgREST error code.
  2. Run `Live smoke test` (`gh workflow run smoke.yml`) — it tests posting, voting, replying, and RLS in a rolled-back transaction on production.
  3. Check Supabase Dashboard → **Database → Logs** and **API Logs** for `PGRST` schema cache errors (fixable with `notify pgrst, 'reload schema';`) or connection pool saturation.
- **Safe mitigation:**
  - If a recent migration caused the regression, roll it back using its paired `supabase/rollback/<NNNN>_down.sql` file (see Section 3E).
  - If free-tier connection/egress limits are hit, verify Supabase Pro upgrade (#316) is active.

### D. Site availability / traffic spike
- **Symptoms:** `publisense.app` returns 5xx, slow loads, or timeouts during Show HN / Product Hunt spike.
- **Check:**
  1. Check Vercel Dashboard → **Deployments** & **Logs** (confirm serverless `/api/*` functions like `/api/share`, `/api/og`, `/api/badge` aren't timing out).
  2. Check Supabase Dashboard → **Reports → Database** (CPU, connections, disk I/O).
  3. Run `gh workflow run smoke.yml` to verify all public routes (`/`, `/categories`, `/b/cursor`, `/h/figma`, `/sitemap.xml`, `/og.png`).
- **Safe mitigation:**
  - Confirm Supabase Pro (#316) is enabled before launch day.
  - If an individual serverless endpoint (`/api/og` or `/api/share`) spikes, roll back the last Vercel deployment if it introduced a regression.

### E. Deployment rollback
- **Frontend / Vercel API rollback (≤ 2 minutes):**
  1. Open **Vercel Dashboard → `publisense-v2` → Deployments**.
  2. Select the last known-good production deployment and click **Instant Rollback**.
  3. Re-run `gh workflow run smoke.yml` to confirm 200s and healthy smoke checks.
- **Database migration rollback:**
  1. Never drop tables or edit production data ad-hoc without a fresh backup first (`gh workflow run backup.yml`).
  2. Every recent schema migration has a paired rollback script in `supabase/rollback/<NNNN>_down.sql`.
  3. Review the rollback script carefully, run it in a single transaction against `SUPABASE_DB_URL` (removing the corresponding row from `supabase_migrations.schema_migrations` and running `notify pgrst, 'reload schema';`), then run `gh workflow run smoke.yml`.

---

## 4. External communications & pausing launch

- **Where to communicate:**
  - **Active launch threads:** Edit the top comment / reply on Show HN, post a concise update from `@publisensehq` on X, and update the maker comment on Product Hunt.
  - **Direct support:** Reply to every affected user via `support@publisense.app` once mitigated.
- **When to pause launch outreach:**
  - Immediately on any **P0** (site down, auth broken, RLS/privacy breach) or sustained **P1** lasting > 30 minutes.
  - Pause new outreach messages (#313) and maker sharing (#317) until `smoke.yml` and `e2e.yml` are green again.
- **Status update template (short, honest, no speculation):**
  - *Investigating:* "We're seeing [symptom, e.g., delayed sign-in emails] on Publisense right now and are actively investigating. Existing data is safe — next update in 30 minutes."
  - *Resolved:* "[Symptom] is resolved as of [HH:MM UTC]. Everything is back to normal; if you hit a snag earlier, please retry or email support@publisense.app."

---

## 5. Backups, Storage recovery, moderation & FAQ

### Database and Storage recovery
- Full backup schedule, GPG decryption, Storage media archive format, and isolated non-production restore drill instructions live in [`docs/backup.md`](./backup.md) and [`scripts/restore-drill.sh`](../scripts/restore-drill.sh) (tracked in #319).
- **Golden rule:** Never restore a dump directly over production without first validating it in an isolated scratch Supabase project.

### Moderation and abuse reporting
1. Open `/admin/reports` to review flagged posts, replies, and accounts.
2. **Spam / abuse:** hide offending posts or replies (`Hide post` / `Hide reply`), or block abusive accounts from a board.
3. **Impersonation / wrong claim:** review in `/admin/disputes`, revoke unauthorized team access, and preserve audit rows.
4. **Severe / illegal content:** remove immediately, document the action in the incident log, and revoke the offending account if needed.

### Short support FAQ
- **"My product isn't listed yet."** → Sign in, click **Add product**, paste the product URL (name, tagline, and logo autofill), and submit; new boards are reviewed quickly in `/admin/products`.
- **"How do we get the Verified team badge?"** → Open your product's board, click **Work at [Product]?**, and verify with your company work email (6-digit code) or a DNS TXT record — takes under 2 minutes and is free.
- **"Can we remove or edit someone's feedback?"** → Verified teams can post official replies, update post status (`Under review` → `Planned` → `In progress` → `Shipped`), and merge duplicates; genuine critical feedback stays public unless it violates site rules (spam/abuse can be reported to moderators).
- **"How do I turn off email notifications or the weekly digest?"** → Click **Unsubscribe** at the bottom of any email (one-click, no sign-in required) or toggle individual channels at `https://publisense.app/settings#notifications`.
- **"Can I delete my account?"** → Yes, from `https://publisense.app/settings` (Account → Delete account).

---

## 6. Incident log

Record every P0, P1, or P2 incident during the launch window here (or link the GitHub incident issue):

| Date (UTC) | Severity | Summary | Duration | Mitigation / Fix | Follow-up issue |
| :--- | :--- | :--- | :--- | :--- | :--- |
| _No incidents recorded yet_ | — | — | — | — | — |
