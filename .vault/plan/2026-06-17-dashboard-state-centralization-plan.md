---
tags:
  - '#plan'
  - '#dashboard-state-centralization'
date: '2026-06-17'
modified: '2026-06-22'
tier: L3
related:
  - '[[2026-06-17-dashboard-state-centralization-adr]]'
  - '[[2026-06-17-dashboard-state-centralization-research]]'
---

# `dashboard-state-centralization` plan

## Description

This plan centralizes shared dashboard state behind a backend-owned,
TanStack-managed state surface. Filters, selection, hover, date range, timeline
mode, salience lens, salience focus, graph granularity, representation mode,
panel state, and graph bounds become one canonical snapshot. The left panel,
right panel, timeline, graph stage, graph controls, and scene bridge become
subscribers that read the snapshot and emit typed mutations.

The campaign deliberately burns down duplicated legacy state instead of wrapping
it forever. `filters` remains only a pure compiler, the standalone salience lens
store is deleted, the stale timeline `window` state is removed, local date-range
writers are routed through the canonical mutation, and the unfiltered graph
availability query is removed or made identity-equivalent to the held slice.

Backend state is session state only. It must remain bounded, transient, carried
through the shared envelope and tiers discipline, and separate from vault
content and graph semantics.

## Wave `W01` - State contract and backend authority

Define the canonical dashboard-state shape and serve it from the backend as a bounded session state surface. TanStack client work in Wave two depends on this wire contract. Backed by the state-centralization ADR and research.

### Phase `W01.P01` - Canonical state schema

Define the dashboard-state schema for scope, selection, hover, filters, date range, timeline mode, graph granularity, salience lens and focus, representation mode, and shared panel affordances.

- [x] `W01.P01.S01` - Define the DashboardState wire schema carrying scope, selected ids, hovered id, filters, date range, timeline mode, graph granularity, salience lens, salience focus, representation mode, panel state, and graph bounds; `engine/crates/vaultspec-api/src/routes/state.rs`.
- [x] `W01.P01.S02` - Add validation for stable node ids, date-range ordering, bounded selected ids, and recognized salience lens values; `engine/crates/vaultspec-api/src/routes/state.rs`.
- [x] `W01.P01.S03` - Reuse the graph filter parser for canonical filter state so state and graph queries share one filter grammar; `engine/crates/engine-query/src/filter.rs`.
- [x] `W01.P01.S04` - Document the dashboard-state route shape in the foundation contract reference; `.vault/reference/2026-06-12-dashboard-foundation-reference.md`.

### Phase `W01.P02` - Backend state route

Serve and update the dashboard-state snapshot through the API without mutating vault content or graph semantics.

- [x] `W01.P02.S05` - Serve the current dashboard-state snapshot through the shared envelope helper; `engine/crates/vaultspec-api/src/routes/state.rs`.
- [x] `W01.P02.S06` - Apply patch-style dashboard-state updates without writing vault content or graph semantics; `engine/crates/vaultspec-api/src/routes/state.rs`.
- [x] `W01.P02.S07` - Register the dashboard-state route in the API routes module; `engine/crates/vaultspec-api/src/routes/mod.rs`.
- [x] `W01.P02.S08` - Add route tests proving success and validation errors both carry the tiers block; `engine/crates/vaultspec-api/src/routes/state.rs`.
- [x] `W01.P02.S09` - Add route tests proving selected ids and date ranges are bounded and rejected when invalid; `engine/crates/vaultspec-api/src/routes/state.rs`.

## Wave `W02` - TanStack canonical client

Build the sole frontend read and mutation surface for dashboard state in the stores server layer. View migration in Wave three depends on these hooks and mutation helpers.

### Phase `W02.P03` - Wire types and query keys

Add frontend wire types, adapters, and query keys for the state snapshot so cache identity is explicit and stable.

- [x] `W02.P03.S10` - Add DashboardState, DashboardStatePatch, DashboardSelection, and DashboardFilters wire types; `frontend/src/stores/server/engine.ts`.
- [x] `W02.P03.S11` - Add engine client methods for reading and patching dashboard state; `frontend/src/stores/server/engine.ts`.
- [x] `W02.P03.S12` - Add tolerant live adapters for the dashboard-state response while preserving stable identity fields; `frontend/src/stores/server/liveAdapters.ts`.
- [x] `W02.P03.S13` - Add a dashboard-state query-key factory keyed by scope and backend session identity; `frontend/src/stores/server/queries.ts`.

### Phase `W02.P04` - Mutation and intent helpers

Add mutation helpers for every shared dashboard intent so views do not hand-edit local stores.

- [x] `W02.P04.S14` - Add the useDashboardState query hook as the only frontend reader for shared dashboard state; `frontend/src/stores/server/queries.ts`.
- [x] `W02.P04.S15` - Add mutation helpers for selection, hover, filters, date range, timeline mode, lens, focus, panel state, representation mode, granularity, and graph bounds; `frontend/src/stores/server/dashboardState.ts`.
- [x] `W02.P04.S16` - Add selector helpers that derive graph query variables from the canonical dashboard state; `frontend/src/stores/server/dashboardState.ts`.
- [x] `W02.P04.S17` - Add real-behavior stores tests that read and mutate dashboard state through the engine client path; `frontend/src/stores/server/dashboardState.test.ts`.

## Wave `W03` - Legacy state burn-down

Remove split-brain filter, selection, salience, date-range, and timeline-window state so every shared view intent flows through the canonical dashboard-state client. Subscriber rewiring in Wave four depends on this cleanup.

### Phase `W03.P05` - Filters and date range

Collapse filter and date-range writers into the canonical state model and delete duplicate local write paths.

- [x] `W03.P05.S18` - Move current filter values behind canonical dashboard-state selectors and leave only pure filter compilation helpers; `frontend/src/stores/view/filters.ts`.
- [x] `W03.P05.S19` - Rewire the stage filter sidebar to update canonical filter state instead of local edited-window state; `frontend/src/app/stage/FilterSidebar.tsx`.
- [x] `W03.P05.S20` - Rewire the timeline range selector to update the canonical date range mutation; `frontend/src/app/timeline/RangeSelect.tsx`.
- [x] `W03.P05.S21` - Derive the graph wire filter from canonical dashboard state instead of rebuilding a partial filter in the stage; `frontend/src/app/stage/Stage.tsx`.

### Phase `W03.P06` - Selection and salience

Collapse selection, hover, salience lens, and focus into one canonical state source and remove standalone split-brain stores.

- [x] `W03.P06.S22` - Move active lens and salience focus into canonical dashboard state; `frontend/src/stores/view/viewStore.ts`.
- [x] `W03.P06.S23` - Delete the standalone salience lens store after all call sites read canonical dashboard state; `frontend/src/stores/view/salienceLens.ts`.
- [x] `W03.P06.S24` - Rewire salience graph query hooks to consume canonical lens and focus selectors; `frontend/src/stores/server/queries.ts`.
- [x] `W03.P06.S25` - Rewire shared selection and hover bindings to emit canonical dashboard-state mutations; `frontend/src/app/stage/graphSync.ts`.

### Phase `W03.P07` - Timeline legacy window

Remove stale timeline window state and migrate all callers to scroll-strip viewport state plus canonical date range and timeline mode.

- [x] `W03.P07.S26` - Remove the stale timeline window field and setWindow action from the timeline store; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W03.P07.S27` - Rewire keyboard timeline stepping to compute from scroll-strip visible range; `frontend/src/app/a11y/KeyboardNav.tsx`.
- [x] `W03.P07.S28` - Rewire event-menu zoom to change scroll offset and scale instead of legacy window state; `frontend/src/app/timeline/menus/eventMarkMenu.ts`.
- [x] `W03.P07.S29` - Rewire timeline-mode entry from salience controls to canonical date and scroll-strip state; `frontend/src/app/stage/LensSelector.tsx`.

## Wave `W04` - Subscriber view integration

Rewire the left panel, right panel, timeline, graph stage, and scene bridge as subscribers to the canonical state, preserving local-only chrome where it is not cross-surface state.

### Phase `W04.P08` - Graph and scene subscribers

Make the stage and scene bridge derive graph query identity, visibility, selection, hover, and lens from canonical state.

- [x] `W04.P08.S30` - Make the stage graph slice hook consume canonical query variables for scope, filter, date range, granularity, lens, and focus; `frontend/src/app/stage/Stage.tsx`.
- [x] `W04.P08.S31` - Remove the unfiltered availability graph query and derive availability from the held canonical slice; `frontend/src/stores/server/queries.ts`.
- [x] `W04.P08.S32` - Make graph controls write representation, granularity, lens, focus, and bounds through canonical dashboard-state mutations; `frontend/src/app/stage/GraphControls.tsx`.
- [x] `W04.P08.S33` - Make scene selection, hover, visibility, and graph bounds subscribe to canonical dashboard state; `frontend/src/app/stage/graphSync.ts`.

### Phase `W04.P09` - Panel and timeline subscribers

Make the left panel, right panel, and timeline read and write shared state through TanStack-backed helpers.

- [x] `W04.P09.S34` - Make the left browser panel subscribe to canonical selection, filter, and scope state; `frontend/src/app/left/TreeBrowser.tsx`.
- [x] `W04.P09.S35` - Make the browser mode store reset only canonical scope-local panel state on scope changes; `frontend/src/stores/view/browserMode.ts`.
- [x] `W04.P09.S36` - Make the right rail subscribe to canonical selection and panel tab state; `frontend/src/app/AppShell.tsx`.
- [x] `W04.P09.S37` - Make timeline controls read filter, date range, lens, and timeline mode from canonical dashboard state; `frontend/src/app/timeline/TimelineControls.tsx`.
- [x] `W04.P09.S38` - Remove local state fields that duplicate canonical dashboard state after subscribers are migrated; `frontend/src/stores/view/viewStore.ts`.

## Wave `W05` - Verification and review

Prove the campaign against real backend behavior, live UI flows, request identity checks, and the full gate before closing the plan.

### Phase `W05.P10` - Real-behavior tests

Add backend, stores, and browser tests that exercise the real code paths without fakes, mocks, stubs, monkeypatches, skips, or xfails.

- [x] `W05.P10.S39` - Add Rust route tests for dashboard-state read, patch, validation, tiers, and bounded selected ids; `engine/crates/vaultspec-api/src/routes/state.rs`.
- [x] `W05.P10.S40` - Add frontend stores tests that exercise dashboard-state reads and mutations against a real engine fixture; `frontend/src/stores/server/dashboardState.test.ts`.
- [x] `W05.P10.S41` - Add browser integration coverage for date-range changes propagating from timeline to graph and panels; `frontend/src/app/timeline/Timeline.render.test.tsx`.
- [x] `W05.P10.S42` - Add browser integration coverage for graph selection propagating to timeline and right rail; `frontend/src/app/stage/Stage.render.test.tsx`.
- [x] `W05.P10.S43` - Add request-count coverage proving filter and lens changes do not issue duplicate graph queries for availability; `frontend/src/stores/server/queries.test.ts`.

### Phase `W05.P11` - Gate and review

Run the full gate, perform code review, and close any durable rule follow-up before marking the campaign complete.

- [x] `W05.P11.S44` - Run the frontend typecheck, lint, format check, and vitest suite to exit 0; `frontend/package.json`.
- [x] `W05.P11.S45` - Run the Rust format, clippy, and test gate to exit 0; `engine/Cargo.toml`.
- [x] `W05.P11.S46` - Run a vaultspec code-review audit over the completed campaign; `.vault/audit/2026-06-17-dashboard-state-centralization-audit.md`.
- [x] `W05.P11.S47` - Run the codify check for any durable state-ownership rule produced by the campaign; `.codex/rules/views-are-projections-of-one-model.md`.

## Parallelization

The Waves are ordered. `W01` must define the backend state contract before
`W02` builds the TanStack client. `W02` must land before `W03` burns down legacy
state. `W03` must land before `W04` rewires every subscriber. `W05` closes the
campaign after implementation.

Within `W01`, schema work in `P01` should land before route behavior in `P02`,
although route tests may be drafted while validation details settle. Within
`W02`, wire types and query keys in `P03` must land before mutation helpers in
`P04`. Within `W03`, `P05`, `P06`, and `P07` may be assigned to separate agents
after `W02` because their primary write sets are disjoint, but they must merge
through the same canonical dashboard-state client. Within `W04`, graph and
scene subscribers in `P08` can overlap panel and timeline subscriber work in
`P09` after the legacy stores are removed. `W05.P10` tests should be added as
each implementation wave lands, but `W05.P11` gates run only after all open
steps are closed.

## Verification

The backend route tests must prove dashboard-state read, patch, validation,
bounded selected ids, and tiers on both success and error. Frontend stores tests
must exercise the real engine client path for state reads and mutations.

Browser integration must prove that a timeline date-range change updates graph
query state and panel subscribers, and that graph selection updates timeline and
right-rail subscribers. Request-count coverage must prove filter and lens
changes do not issue duplicate graph queries for availability.

The stale timeline `window` state, standalone salience lens store, local
edited-window date writer, and unfiltered availability query must be absent
before the plan can close. No test added under this campaign may use fakes,
mocks, stubs, monkeypatches, skips, or xfails.

The frontend typecheck, lint, format check, and vitest suite must exit 0. The
Rust format, clippy, and test gate must exit 0. A vaultspec code-review audit
must be completed, and any durable state-ownership rule must pass through the
codify check before every Step is marked closed.
