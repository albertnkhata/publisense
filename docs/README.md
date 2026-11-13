# Publisense Documentation

Welcome to the Publisense documentation directory. This index defines where project documents live, how decisions are tracked, and how to contribute new specs and design documentation.

---

## Directory Structure

```text
docs/
├── README.md               # This index
├── foundation.md           # The active architecture & design system contract
├── deferred.md             # Canonical register of deferred decisions (D-xxx)
├── backup.md               # Production database backup and recovery runbook
│
├── design/                 # UI/UX, page archetypes, and design system proposals
│   └── page-refinement.md  # Comprehensive site page taxonomy & UI/UX refinement plan
│
├── specs/                  # Feature specifications & technical RFCs
│   └── command-centre.md   # /admin Command Centre & first-party analytics engine
│
└── archive/                # Historical, completed, or retired documentation
    ├── BUILD.md            # v2 9-step rebuild checklist (completed 2026-10-24)
    ├── CUTOVER.md          # 2026-10-24 production cutover runbook and log
    ├── reference-mockup.html # Pre-v2 single-file prototype (v80)
    ├── MVP.md              # Original v1 MVP definition (frozen 2026-10-24)
    ├── roadmap.md          # Original v1 product roadmap (frozen 2026-10-24)
    └── qa/                 # Historical point-in-time test verification logs
```

---

## Core Active Documents

### 1. Architecture & Design Contract: [`docs/foundation.md`](./foundation.md)
The authoritative technical and visual contract for Publisense:
- **Design Tokens:** Strict type scale, locked color palette, radii, borders (`theme.css` `--*: initial`).
- **UI Primitives:** The 10 core primitives (`Button`, `Card`, `Dialog`, `Field`, etc.) and their accessibility/keyboard requirements.
- **Domain Model & State Machines:** Singular database entities (`post`, `board`, `hub`, `reply`), status lifecycles, and verification state machines.
- **Security & RLS:** Permission matrix and RPC boundaries.

### 2. Decision Register: [`docs/deferred.md`](./deferred.md)
The single place to record intentional shortcuts or deferred items (`D-001` to `D-016+`):
- Each entry has an ID, known cost, revisit trigger, and severity (🔴 blocks deploy, 🟡 ship-with-risk, 🟢 minor).
- **Rule:** Entries are never deleted. When resolved, mark with `✅ RESOLVED` and add the commit/PR.
- **CI Dependency:** Machine-parsed by `scripts/status.mjs` to generate [`STATUS.md`](../STATUS.md).

### 3. Operations & Recovery: [`docs/backup.md`](./backup.md)
Production backup schedule (nightly at 02:23 CAT via GitHub Actions) and instructions for decrypting and restoring GPG-encrypted pg_dumps.

---

## Where New Documentation Belongs

| Type of Document | Target Directory | Example |
| :--- | :--- | :--- |
| **UI/UX, Layouts & Interactions** | `docs/design/` | `docs/design/page-refinement.md` |
| **New Features & Architectural RFCs** | `docs/specs/` | `docs/specs/command-centre.md` |
| **Conscious Technical Debt / Shortcuts** | `docs/deferred.md` | New `D-xxx` entry under `## Open` |
| **Completed Milestones or Migration Runbooks** | `docs/archive/` | Historical cutover logs, old prototypes |
