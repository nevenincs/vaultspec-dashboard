---
tags:
  - '#research'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - '[[2026-06-16-status-overview-adr]]'
  - '[[2026-06-26-rag-service-management-adr]]'
  - '[[2026-06-29-agentic-review-station-state-adr]]'
  - '[[2026-07-12-authoring-surface-adr]]'
  - '[[2026-07-12-mobile-unified-rail-adr]]'
---

# `activity-rail-realignment` research: `status rail vs admin pop-up panels`

The user directs a major realignment of the right activity rail: it currently
conflates STATUS reporting (changes, plans, PRs, issues, commits) with ADVANCED
ADMIN CONTROL surfaces (the semantic-search service management console and the
authoring approvals queue), while two served health planes (backend/tier health,
vault check health) have no surface at all. The requested direction: the rail
keeps status only, plus a compact framework status-overview cluster whose
toggles open dedicated Figma-designed pop-up panels that control, review, and
action the services — the information itself need not be exposed inline.

## Findings

### F1 — Current rail composition: five status sections + two inline admin consoles

`frontend/src/app/right/StatusTab.tsx` renders the one scrollable status
surface: the Changes fold (`ChangesOverview`), then Plans / Pull requests /
Issues / Commits section cards — all genuinely status — and then, rendered in
EVERY rail state (even loading/degraded/empty), two admin sections:

- **"Search service"** (`SectionCard id="rag-ops"`) mounting `RagOpsConsoleBody`
  (`frontend/src/app/right/RagOpsConsole.tsx`, 644 lines): machine-level
  lifecycle verbs (start/stop), vitals line, activity progress, and a Details
  fold with maintenance verbs (reindex, watcher, doctor, install), per-tenant
  data management (evict), engine identity, and diagnostics.
- **"Approvals"** (`SectionCard id="authoring-review"`) mounting
  `ReviewStationSection` (`frontend/src/app/authoring/ReviewStation.tsx`,
  539 lines): the human-in-the-loop agentic-authoring review queue
  (claim/approve/reject/respond).

Both are full admin consoles folded inline — exactly the conflation the user
names. Their open state persists as `statusTabChrome` section ids (`rag-ops`,
`rag-ops:details`, `authoring-review` in
`frontend/src/stores/view/statusTabChrome.ts`).

### F2 — Two served health planes are dark today

- **Core / vault check health**: the `/status` snapshot serves
  `core: { reachable, vault_health? }`, projected by `useCoreStatus`
  (`frontend/src/stores/server/queries/status.ts:109-149`) — and NO app-chrome
  surface consumes it (grep: zero `useCoreStatus` consumers under
  `frontend/src/app/`). The 2026-07-12 usefulness survey already flagged
  orphaned right-rail components (`stores/view/nowStrip.ts` is a projection
  with no mounted chrome).
- **Backend/tier health**: degradation is read from `tiers` per-surface
  (each rail/canvas surface renders its own degraded state), but there is no
  central "framework health" overview anywhere in the chrome.

A status-overview cluster gives both planes their first honest home, satisfying
wire-contract law (displayed state backend-served) with zero new engine work
for v1 beyond what `/status` already carries.

### F3 — Prior decisions: the conflation is inherited, and each piece is movable

- The 2026-06-12 `dashboard-gui` ADR §2.3 put "pillar 2" operational verbs
  (start/stop service, reindex, watcher tuning, vault check) INLINE in the rail
  as a "deliberately modest" control surface — the original source of the
  conflation.
- The 2026-06-16 `status-overview` ADR re-scoped the rail's PRIMARY surface to
  the operator questions "where / what's in flight / what's committed" — the
  realignment completes that re-scope by evicting the non-status residents.
- The 2026-06-26 `rag-service-management` ADR D7 mounts the console as a rail
  section; that placement (not the console's internals, contract tiers, or
  action wiring) is what a new decision must amend.
- The `agentic-review-station-state` ADR fixes the review queue as a
  backend-served projection; the 2026-07-12 `authoring-surface` epic mounted it
  in the rail (W03.P40). Only the mount point moves.
- The 2026-07-12 `mobile-unified-rail` ADR merges Browse+Status into one compact
  scroll — any panel container must also work on compact (a modal dialog does;
  the compact surface currently inherits both admin sections' bloat, so the
  realignment improves compact for free).

### F4 — The pop-up panel infrastructure already exists as a proven idiom

The Settings dialog is the template, end to end:

- **Container**: `frontend/src/app/chrome/Dialog.tsx` — the one modal dialog
  primitive (focus trap, dismiss-on-escape, scrim), already used by Settings
  and the create-document dialog.
- **Open state**: `frontend/src/stores/view/settingsDialog.ts` — a tiny shared
  view-store open flag so chrome and the command palette drive the same dialog.
- **Action enrollment**: the "Settings" verb is one `ActionDescriptor` enrolled
  in the palette/keymap planes (`stores/view/chromeActions.ts`,
  `commandRegistry.ts`) per the actions-keymap-palette law. Each panel toggle
  is the same shape: one descriptor, palette command, optional chord, and the
  status-cluster chip as the visible trigger.
- **Figma-first**: the design-system law binds panels to Figma frames; the
  console already carries an `@figma` header (`RagOpsConsole` · 879:4125,
  currently marked stale by its own comment) — new panel frames re-bind cleanly.

### F5 — What stays in the rail vs what moves

Stays (status): Changes fold, Plans, Pull requests, Issues, Commits — plus a
NEW compact framework status cluster (see F6). Moves into pop-up panels:

| Panel | Today | Backing stores plane |
| --- | --- | --- |
| Search service | rail section (F1) | `stores/server/ragControl.ts` hooks (Tier 1/2 contract per rag-service-management) |
| Approvals | rail section (F1) | authoring review-station projection (`stores/server/authoring.ts`) |
| Backend health | dark (F2) | `/status` tiers + per-backend rollups already projected in `stores/server/queries/status.ts` |
| Vault health | dark (F2) | `core.vault_health` via `useCoreStatus`; the vault-check verb rides the existing ops seam |

The moves are chrome-only re-mounts: both consoles are already glass over
stores hooks (dashboard-layer-ownership holds), so no stores or engine change
is required to relocate them. Panel BADGE counts (e.g. approvals pending) stay
backend-served numbers the cluster reads from the same projections.

### F6 — The status cluster: information-light, toggle-first

The requested cluster is a compact strip of framework-status affordances — one
chip/dot per plane (search service, approvals, backend health, vault health) —
each rendering only a served health tone + count, and acting as the TOGGLE for
its pop-up panel. Open questions that are design decisions for the ADR:

- **Placement**: a pinned cluster at the rail's top (above Changes) vs a rail
  footer strip. Top-of-rail matches the operator glance pattern; footer keeps
  the status stack leading.
- **Container**: the modal `Dialog` (Settings idiom, works on compact) vs an
  anchored `Popover` (kit exists, but a 600-line console overflows a popover)
  vs a docked overlay panel. The Dialog is the grounded default.
- **Persisted-state migration**: `statusTabChrome` section ids `rag-ops`,
  `rag-ops:details`, `authoring-review` retire; per no-deprecation-bridges the
  ids are deleted (the normalizer already drops unknown ids on rehydrate, so no
  migration shim is needed) and each panel's open state is a non-persisted
  view-store flag like `settingsDialog`.
- **Figma frames**: one frame per panel + the cluster chip row, bound before
  implementation (figma-is-the-binding-source-of-truth).

### F7 — Constraints checklist for the ADR

- One `ActionDescriptor` per panel toggle, enrolled palette + keymap + cluster
  chip (actions-keymap-palette); no bespoke per-surface handlers.
- Panels are chrome over existing stores hooks; no new fetch, no raw `tiers`
  reads (architecture-boundaries). Health tones derive from tiers/status
  projections, never transport errors.
- Counts on chips are engine-served rollups, never client re-counts
  (wire-contract).
- Mount-gating: a closed panel mounts nothing, so the heavy rag aggregate and
  review-queue reads fire only on open (data-loading) — an IMPROVEMENT over
  today, where the collapsed rag fold still renders in every rail state.
- Compact shell: panels open as full-screen-friendly dialogs; the cluster joins
  the compact unified rail without adding scroll bloat.
- Labels plain-language (Search service, Approvals, Backend health, Vault
  health); internal vocabulary (rag, tiers) never on screen.
