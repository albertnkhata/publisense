# Daily launch scorecard

Daily tracking ledger from pre-launch seeding through the **Mon Jan 25, 2027** exit gate (#314, #318).

> **Scope rule (#318):** Targets below reflect only thresholds already agreed in #314. Launch dates are owned by #314 and #317 and are never altered here.

---

## 1. Metric definitions

| Metric | Exact calculation | Source | Target / threshold | Update cadence | Owner |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Target list — Wave 1** | Count of Wave 1 (coding-agent & AI CLI) teams with board, handle/email fallback, channel, and status populated | Founder tracker sheet (#311) | **35** teams | Daily until complete | Albert |
| **Target list — Wave 2** | Count of Wave 2 (LLM SDK & eval) teams populated | Founder tracker sheet (#311) | **40** teams (**75** total) | Daily until complete | Albert |
| **Seeded boards — Wave 1** | Count of Wave 1 boards with **5–8 real, source-credited posts** live | `/admin` Command Centre + board list (#312) | **35** boards (before Dec 7) | Daily during seeding | Albert |
| **Seeded boards — Wave 2** | Count of Wave 2 boards with **5–8 real, source-credited posts** live | `/admin` Command Centre + board list (#312) | **40** boards (during Dec 21–Jan 3 hold) | Daily during seeding | Albert |
| **Outreach sent (Wave 1 / Wave 2)** | Cumulative initial DMs/emails sent (excl. follow-ups), plus weekly pace | Founder tracker sheet (#313) | ~17–20 msgs/wk (W1 Dec 7–20; W2 Jan 4–15) | Daily during waves | Albert |
| **Founder replies (Wave 1 / Wave 2)** | Count of unique target teams that replied positively or engaged on their board | Founder tracker sheet (#313) | Tracked vs outreach sent (response %) | Daily during waves | Albert |
| **Claimed boards (Exit gate #314)** | `loop.claimed_boards` — live boards claimed directly or via a claimed hub (excl. internal/throwaway test boards) | `/admin` Command Centre (`admin_command_centre`) | **10+** by Mon Jan 25 | Daily | Albert |
| **Team-replied Shipped posts (Exit gate #314)** | Count of visible `status = 'shipped'` posts that have ≥ 1 official (`is_official = true`) team reply | Production SQL / `/admin` Command Centre | **5+** by Mon Jan 25 | Daily | Albert |
| **Open launch blockers** | Count of open launch issues blocking public launch (`#306`–`#320`) | `gh issue list --state open` | **0** pre-launch blockers before launch day | Daily | Albert |
| **Nightly backup & smoke health** | Most recent status (`pass` / `fail` + run ID) of `backup.yml`, `smoke.yml`, and `e2e.yml` | GitHub Actions (#307) | **Green** daily | Daily | Albert |

### Quick query for exit-gate counts (read-only)
```sql
select
  (select count(*) from public.board b
     left join public.hub h on h.id = b.hub_id
    where b.status = 'live'
      and (b.claimed_at is not null or h.claimed_at is not null)) as claimed_boards,
  (select count(distinct p.id) from public.post p
     join public.board b on b.id = p.board_id and b.status = 'live'
     join public.reply r on r.post_id = p.id and r.is_official and r.hidden_at is null
    where p.hidden_at is null and p.status = 'shipped') as team_replied_shipped_posts;
```

---

## 2. Daily scorecard log

Add one row per day. Each row records: **Date**, **Current vs target/baseline**, **Delta**, **Source**, **Owner**, **Blocker**, and **Next action**.

| Date (UTC) | Pipeline (W1/W2 list · seeded · outreach · replies) | Exit gate: Claimed boards (target 10+) | Exit gate: Team-replied Shipped (target 5+) | Delta (vs prior day) | Readiness: Open launch issues · Backup / Smoke | Source | Owner | Blocker | Next action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-11-22 | List 0/35 · 0/40 · Seeded 0/75 · Outreach 0 · Replies 0 *(32 existing live boards, 191 imported posts)* | 0 / 10+ *(baseline)* | 0 / 5+ *(baseline)* | Baseline | Open: #306, #308, #310–#320 · Backup #44996354011 ✓ · Smoke #44996358001 ✓ · E2E #44996360489 ✓ | `STATUS.md`, GitHub Actions, `gh issue list` | Albert | Pre-launch ops (#319 drill, #306 QA, #308 inbox check) | Finish runbook/Storage backup, run #319 drill & #306 QA, start #311 founder list |
| 2026-11-28 | List 35/35 · 0/40 · Seeded 35/75 (W1 35/35 done) · Outreach 0 · Replies 0 | 0 / 10+ | 0 / 5+ | +35 W1 seeded; closed #306, #308, #310, #311, #319, #320 | Open: #312–#318 · Backup #46123660431 ✓ · Smoke #45975248190 ✓ · E2E #45975860959 ✓ · Drill #46126492607 ✓ | `publisense.app/c/code`, GitHub Actions, `gh issue list` | Albert | None (all pre-outreach ops cleared) | Compile Wave 1 credited-author outreach list & start Phase 1A user outreach (#313) |

---

## 3. Mon Jan 25, 2027 exit-gate decision (#314)

Complete this section on **Mon Jan 25, 2027** before launching:

- **Decision:** `[ ] PASS` / `[ ] HOLD (shift 1 week per #314 & #317)`
- **Recorded at (UTC):** `_YYYY-MM-DD HH:MM UTC_`
- **Claimed boards (target 10+):** `_N_` (evidence link / screenshot: `_link_`)
- **Team-replied Shipped posts (target 5+):** `_N_` (evidence link / query output: `_link_`)
- **Open launch blockers:** `_0 / list_`
- **Latest backup & smoke runs:** `_Actions run links_`
- **Owner sign-off:** Albert Nkhata
