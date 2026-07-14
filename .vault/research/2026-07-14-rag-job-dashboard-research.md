---
tags:
  - '#research'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - '[[2026-07-14-activity-rail-realignment-research]]'
  - '[[2026-06-26-rag-service-management-adr]]'
  - '[[2026-06-16-rag-control-plane-adr]]'
---

# `rag-job-dashboard` research: `job-dashboard grounding over the codified rag contract`

The user directs an explicit redesign of the search-service control surface
into a JOB DASHBOARD: header and footer bars, a job list with filter query,
sorting and filtering, a log view with its own filter, service lifecycle
controls, and storage information. This grounds what the codified contract
already serves and what the frontend stores plane still lacks.

## Findings

### F1 — Every dashboard data need is already served by the codified contract

- **Jobs**: `GET /ops/rag/jobs` (brokered verbatim; `useRagJobs` +
  `useRagJobProgress` exist in `frontend/src/stores/server/ragControl.ts`,
  trigger-then-poll per rag-control-plane D3). Job rows carry id, phase,
  progress `{completed,total,step}`, kind/timing fields.
- **Logs**: rag serves `GET /logs/json?lines=&job_id=` — a JSON
  `{lines, total, filters}` envelope (engine `rag-client/src/control.rs:121-141`
  `logs()`), and the engine's `/ops/rag/{verb}` READ whitelist includes `logs`
  (and `metrics`) per `vaultspec-api/src/lib.rs:206` and the engine client
  comment (`stores/server/engine/client.ts:740-741`). NOTHING in the frontend
  consumes it yet — the logs pane is a new stores hook over an existing route.
- **Storage**: the aggregated `GET /ops/rag/ops-state` snapshot
  (`useRagOpsState`) carries the Rust-computed `RagStorageRollup`
  (total points, footprint bytes, namespaces, live/orphaned counts, and an
  explicit `truncated` lower-bound flag — RCR-002 honesty).
- **Lifecycle + maintenance**: start/stop/doctor/install, reindex-with-progress,
  watcher start/stop/reconfigure, project evict — all existing hooks in
  `ragControl.ts`, dispatched through the one ops seam.
- **Service identity/health**: `useRagServiceState`, `useRagStatus`
  (tiers-gated), readiness.

### F2 — What is missing is purely frontend

- No `useRagLogs` hook (lines + job_id params) and no typed engine-client
  `logs` convenience method (the generic brokered GET exists; executors must
  verify the engine route forwards the `lines`/`job_id` query params — the
  rag-client fn signature says it does).
- No job-list VIEW derivation (sort/filter/facet) — the console renders only
  "latest activity" + a small recent-jobs fold.
- The current `SearchServicePanel` (activity-rail-realignment D3) re-hosts the
  2026-07-03 streamlined console, which was designed for a 300px rail — not a
  dashboard.

### F3 — Laws that shape the design

- Job sorting/filtering is PRESENTATION over the served bounded jobs list —
  view-local state, never `dashboardState.filters` (the corpus-filter
  authority; filter-vs-presentation split). Truncation of the served list must
  stay honest when a narrow applies (complete-set law analogue).
- Log reads must be bounded (a `lines` cap) and poll only while the panel is
  open (mount-gating); every accumulator bounded.
- Degradation stays tiers-read; the dashboard renders designed offline states,
  never dead controls (dashboard-rag-manager precedent).
- Figma-first for every element (standing law + the user's directive on the
  parent feature); labels plain-language (no "rag", "qdrant", "namespace"
  vocabulary on screen — the existing console's translations are the
  precedent).
- Contract tiers hold (rag-service-management D-decisions): Tier 1 rag HTTP
  only; the blake2b recompute exception is untouched; no new Qdrant reads
  needed for v1.

### F4 — Container and shell

The panel opens from the realignment's footer cluster (`ControlPanels.tsx`
host, one Dialog primitive). A dashboard needs more width/height than the
Settings-shaped dialog: a WIDE dialog variant (header bar / scrollable body /
footer bar) is a shell-level design decision for the ADR; compact must still
work (the dialog is already compact-safe; the dashboard body must collapse to
a single column).
