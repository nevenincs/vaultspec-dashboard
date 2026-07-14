---
tags:
  - '#adr'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-rag-job-dashboard-research]]"
  - '[[2026-07-14-activity-rail-realignment-adr]]'
  - '[[2026-06-26-rag-service-management-adr]]'
  - '[[2026-06-16-rag-control-plane-adr]]'
---

# `rag-job-dashboard` adr: `the search-service panel becomes a job dashboard` | (**status:** `accepted`)

## Problem Statement

The Search service control panel (activity-rail-realignment D3) re-hosts the
2026-07-03 rail console — a 300px glance card. The user directs an explicit
dashboard: header and footer bars, a job list with filter query, sorting and
filtering, a log view, the service lifecycle controls, and storage
information — the operational cockpit for the one machine-level semantic
service. The same-feature research establishes that every data need already
rides the codified Tier-1 rag HTTP contract (jobs, logs — served but consumed
nowhere — the storage rollup, lifecycle verbs); the work is a frontend stores
extension plus a Figma-designed dashboard surface.

## Considerations

- The `/ops/rag/*` READ whitelist already includes `logs` (JSON envelope with
  `lines`/`job_id` params) and the aggregated ops-state snapshot carries the
  bounded storage rollup with explicit lower-bound truncation honesty.
- Job sort/filter is presentation over one served bounded list — view-local,
  never the corpus-filter record; narrows over a truncated list must state the
  bound.
- The panel opens from the framework status cluster through the existing
  `ControlPanels` host and Dialog primitive; compact must keep working.
- Standing laws: Figma-first for every element; centralized kit + tokens;
  plain-language labels (no internal service vocabulary on screen);
  degradation tiers-read with designed offline states; every read bounded and
  mount-gated; one ActionDescriptor per verb through the one ops seam.
- The rag-service-management contract tiers stand unchanged; v1 needs no
  Qdrant (Tier 2) reads and files no new Tier 3 asks.

## Considered options

- **Grow the existing console in place** (more folds in the small dialog) —
  rejected: a fold stack cannot carry a queryable job table + log pane; it
  reproduces the rail-era cramping inside a dialog.
- **A separate full-page route/surface** — rejected: the dashboard is an
  operator cockpit reached from the status cluster, not a navigation
  destination; a page breaks the panel idiom and adds routing scope.
- **Wide dashboard dialog with header/body/footer bars** — chosen: keeps the
  one Dialog primitive and cluster entry, adds a size variant, and gives the
  job table + log pane honest room.

## Constraints

- The engine broker must forward the `lines`/`job_id` query params on
  `/ops/rag/logs`; the rag-client fn supports both, but the route passthrough
  must be VERIFIED early (W01) — if it drops params, a small engine passthrough
  fix is in scope (parameter forwarding only, no new semantics).
- Log volume: reads are `lines`-capped (default 200, max 500 — AMENDED
  2026-07-14 at execution: the engine broker's own `MAX_RAG_LOG_LINES` clamp is
  500, and the client must never offer a choice the broker under-delivers) and
  poll only
  while the dashboard is open; no client-side log accumulation beyond the last
  served envelope (bounded-accumulator law).
- The served jobs list is bounded; sorting/filtering never fabricates
  completeness — a truncated list renders its bound.
- Figma write MCP flaps; the design wave tolerates batched authoring.

## Implementation

D1 — **The Search service panel becomes the rag job dashboard.** One WIDE
dialog (a `size="wide"` variant on the one Dialog primitive — header bar,
scrollable body, footer bar) replacing the re-hosted rail console inside
`ControlPanels`. The old console component retires from the panel (the rail
already evicted it); its translations and designed states carry forward.

D2 — **Header bar**: service identity + health word (tiers-read), the
lifecycle verbs (Start/Stop/Restart/Doctor/Install as the existing
dispatch-seam actions), and the reindex trigger with its inline progress.

D3 — **Jobs region**: a sortable, filterable job table over the served jobs
list — columns Job / Phase / Progress / Started / Duration; a text filter
query (id/step/kind substring), phase facet chips (Running / Queued / Done /
Failed), sort by recency or duration. Selecting a job JOINS the log pane
(sets its job filter). All view-local presentation state in one
`stores/view/ragDashboard.ts` store; the served list's truncation renders as
an explicit bound note.

D4 — **Log region**: a new `useRagLogs(scope, {lines, jobId})` stores hook
over the brokered `/ops/rag/logs` read — lines selector (50/200/500), free-
text client filter over the served window (presentation, honest about the
window), optional job filter joined from the table, poll-while-open with the
jobs poll cadence, monospace log rows with level tones. A new typed
engine-client method carries the params.

D5 — **Footer bar**: storage information from the ops-state rollup — points,
footprint, tenant/namespace counts with live/orphaned split and the
lower-bound truncation note — plus watcher state + toggle and the panel's
refresh action.

D6 — **Figma-first, every element**: a dashboard frame set in the binding
file — the wide panel shell (header/body/footer), the job table (header row,
row states incl. running progress + failed), the filter/sort controls, the
log pane (rows, level tones, empty/offline states), the footer storage strip
— Kit-composed on the token scale; code mirrors by name-as-contract.

D7 — **State + laws**: dashboard view state (sort key, phase facet, filter
texts, selected job, lines choice) is one bounded view-local store; every
read mount-gates on the open panel; degradation renders the designed offline
card (verbs that cannot apply while down render as the existing
disabled-with-reason idiom, never dead-looking controls).

## Rationale

Research F1/F2: the contract already serves everything (including the
never-consumed logs route), so the dashboard is a stores + chrome + design
build with at most a parameter-forwarding engine fix. The wide-dialog option
preserves the panel architecture the realignment just landed while giving the
table/log regions real room. Presentation-vs-filter law keeps the job/log
queries out of the corpus filter authority. The header/footer bar structure
matches the user's explicit brief.

## Consequences

- The operator gets a real cockpit: queryable job history, a filterable log
  tail, storage truth, and lifecycle control in one place — replacing the
  glance card whose Details fold hid everything.
- Two new stores capabilities (logs hook, jobs view derivation) become
  reusable beyond the panel (e.g. a future activity feed).
- The Dialog primitive gains a size variant — a small, reviewed kit change.
- Poll cost rises while the dashboard is open (jobs + logs + ops-state);
  bounded by mount-gating and caps, zero at rest.
- The old console composition retires; its tests re-anchor onto the dashboard
  regions (the designed offline/empty states carry forward).
- L3 delivery: a design wave, a stores/contract wave, and a chrome wave, with
  parallel Opus lanes inside each wave.
