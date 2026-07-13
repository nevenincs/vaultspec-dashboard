---
generated: true
tags:
  - '#index'
  - '#dashboard-state-centralization'
date: '2026-07-03'
modified: '2026-07-12'
related:
  - '[[2026-06-17-dashboard-state-centralization-W01-P01-S01]]'
  - '[[2026-06-17-dashboard-state-centralization-W01-P01-S02]]'
  - '[[2026-06-17-dashboard-state-centralization-W01-P01-S03]]'
  - '[[2026-06-17-dashboard-state-centralization-W01-P01-S04]]'
  - '[[2026-06-17-dashboard-state-centralization-W01-P02-S05]]'
  - '[[2026-06-17-dashboard-state-centralization-W01-P02-S06]]'
  - '[[2026-06-17-dashboard-state-centralization-W01-P02-S07]]'
  - '[[2026-06-17-dashboard-state-centralization-W01-P02-S08]]'
  - '[[2026-06-17-dashboard-state-centralization-W01-P02-S09]]'
  - '[[2026-06-17-dashboard-state-centralization-W02-P03-S10]]'
  - '[[2026-06-17-dashboard-state-centralization-W02-P03-S11]]'
  - '[[2026-06-17-dashboard-state-centralization-W02-P03-S12]]'
  - '[[2026-06-17-dashboard-state-centralization-W02-P03-S13]]'
  - '[[2026-06-17-dashboard-state-centralization-W02-P04-S14]]'
  - '[[2026-06-17-dashboard-state-centralization-W02-P04-S15]]'
  - '[[2026-06-17-dashboard-state-centralization-W02-P04-S16]]'
  - '[[2026-06-17-dashboard-state-centralization-W02-P04-S17]]'
  - '[[2026-06-17-dashboard-state-centralization-W03-P05-S18]]'
  - '[[2026-06-17-dashboard-state-centralization-W03-P05-S19]]'
  - '[[2026-06-17-dashboard-state-centralization-W03-P05-S20]]'
  - '[[2026-06-17-dashboard-state-centralization-W03-P05-S21]]'
  - '[[2026-06-17-dashboard-state-centralization-W03-P06-S22]]'
  - '[[2026-06-17-dashboard-state-centralization-W03-P06-S23]]'
  - '[[2026-06-17-dashboard-state-centralization-W03-P06-S24]]'
  - '[[2026-06-17-dashboard-state-centralization-W03-P06-S25]]'
  - '[[2026-06-17-dashboard-state-centralization-W03-P07-S26]]'
  - '[[2026-06-17-dashboard-state-centralization-W03-P07-S27]]'
  - '[[2026-06-17-dashboard-state-centralization-W03-P07-S28]]'
  - '[[2026-06-17-dashboard-state-centralization-W03-P07-S29]]'
  - '[[2026-06-17-dashboard-state-centralization-W04-P08-S30]]'
  - '[[2026-06-17-dashboard-state-centralization-W04-P08-S31]]'
  - '[[2026-06-17-dashboard-state-centralization-W04-P08-S32]]'
  - '[[2026-06-17-dashboard-state-centralization-W04-P08-S33]]'
  - '[[2026-06-17-dashboard-state-centralization-W04-P09-S34]]'
  - '[[2026-06-17-dashboard-state-centralization-W04-P09-S35]]'
  - '[[2026-06-17-dashboard-state-centralization-W04-P09-S36]]'
  - '[[2026-06-17-dashboard-state-centralization-W04-P09-S37]]'
  - '[[2026-06-17-dashboard-state-centralization-W04-P09-S38]]'
  - '[[2026-06-17-dashboard-state-centralization-W05-P10-S39]]'
  - '[[2026-06-17-dashboard-state-centralization-W05-P10-S40]]'
  - '[[2026-06-17-dashboard-state-centralization-W05-P10-S41]]'
  - '[[2026-06-17-dashboard-state-centralization-W05-P10-S42]]'
  - '[[2026-06-17-dashboard-state-centralization-W05-P10-S43]]'
  - '[[2026-06-17-dashboard-state-centralization-W05-P11-S44]]'
  - '[[2026-06-17-dashboard-state-centralization-W05-P11-S45]]'
  - '[[2026-06-17-dashboard-state-centralization-W05-P11-S46]]'
  - '[[2026-06-17-dashboard-state-centralization-W05-P11-S47]]'
  - '[[2026-06-17-dashboard-state-centralization-adr]]'
  - '[[2026-06-17-dashboard-state-centralization-audit]]'
  - '[[2026-06-17-dashboard-state-centralization-plan]]'
  - '[[2026-06-17-dashboard-state-centralization-research]]'
  - '[[2026-07-03-dashboard-state-centralization-audit]]'
---

# `dashboard-state-centralization` feature index

Auto-generated index of all documents tagged with `#dashboard-state-centralization`.

## Documents

### adr

- `2026-06-17-dashboard-state-centralization-adr` - `dashboard-state-centralization` adr: `Centralize dashboard state through backend-backed TanStack stores` | (**status:** `accepted`)

### audit

- `2026-06-17-dashboard-state-centralization-audit` - `dashboard-state-centralization` audit: state authority pass
- `2026-07-03-dashboard-state-centralization-audit` - `dashboard-state-centralization` audit: `TanStack Query implementation quality`

### exec

- `2026-06-17-dashboard-state-centralization-W01-P01-S01` - Define the DashboardState wire schema carrying scope, selected ids, hovered id, filters, date range, timeline mode, graph granularity, salience lens, salience focus, representation mode, panel state, and graph bounds
- `2026-06-17-dashboard-state-centralization-W01-P01-S02` - Add validation for stable node ids, date-range ordering, bounded selected ids, and recognized salience lens values
- `2026-06-17-dashboard-state-centralization-W01-P01-S03` - Reuse the graph filter parser for canonical filter state so state and graph queries share one filter grammar
- `2026-06-17-dashboard-state-centralization-W01-P01-S04` - Document the dashboard-state route shape in the foundation contract reference
- `2026-06-17-dashboard-state-centralization-W01-P02-S05` - Serve the current dashboard-state snapshot through the shared envelope helper
- `2026-06-17-dashboard-state-centralization-W01-P02-S06` - Apply patch-style dashboard-state updates without writing vault content or graph semantics
- `2026-06-17-dashboard-state-centralization-W01-P02-S07` - Register the dashboard-state route in the API routes module
- `2026-06-17-dashboard-state-centralization-W01-P02-S08` - Add route tests proving success and validation errors both carry the tiers block
- `2026-06-17-dashboard-state-centralization-W01-P02-S09` - Add route tests proving selected ids and date ranges are bounded and rejected when invalid
- `2026-06-17-dashboard-state-centralization-W02-P03-S10` - Add DashboardState, DashboardStatePatch, DashboardSelection, and DashboardFilters wire types
- `2026-06-17-dashboard-state-centralization-W02-P03-S11` - Add engine client methods for reading and patching dashboard state
- `2026-06-17-dashboard-state-centralization-W02-P03-S12` - Add tolerant live adapters for the dashboard-state response while preserving stable identity fields
- `2026-06-17-dashboard-state-centralization-W02-P03-S13` - Add a dashboard-state query-key factory keyed by scope and backend session identity
- `2026-06-17-dashboard-state-centralization-W02-P04-S14` - Add the useDashboardState query hook as the only frontend reader for shared dashboard state
- `2026-06-17-dashboard-state-centralization-W02-P04-S15` - Add mutation helpers for selection, hover, filters, date range, timeline mode, lens, focus, panel state, representation mode, granularity, and graph bounds
- `2026-06-17-dashboard-state-centralization-W02-P04-S16` - Add selector helpers that derive graph query variables from the canonical dashboard state
- `2026-06-17-dashboard-state-centralization-W02-P04-S17` - Add real-behavior stores tests that read and mutate dashboard state through the engine client path
- `2026-06-17-dashboard-state-centralization-W03-P05-S18` - Move current filter values behind canonical dashboard-state selectors and leave only pure filter compilation helpers
- `2026-06-17-dashboard-state-centralization-W03-P05-S19` - Rewire the stage filter sidebar to update canonical filter state instead of local edited-window state
- `2026-06-17-dashboard-state-centralization-W03-P05-S20` - Rewire the timeline range selector to update the canonical date range mutation
- `2026-06-17-dashboard-state-centralization-W03-P05-S21` - Derive the graph wire filter from canonical dashboard state instead of rebuilding a partial filter in the stage
- `2026-06-17-dashboard-state-centralization-W03-P06-S22` - Move active lens and salience focus into canonical dashboard state
- `2026-06-17-dashboard-state-centralization-W03-P06-S23` - Delete the standalone salience lens store after all call sites read canonical dashboard state
- `2026-06-17-dashboard-state-centralization-W03-P06-S24` - Rewire salience graph query hooks to consume canonical lens and focus selectors
- `2026-06-17-dashboard-state-centralization-W03-P06-S25` - Rewire shared selection and hover bindings to emit canonical dashboard-state mutations
- `2026-06-17-dashboard-state-centralization-W03-P07-S26` - Remove the stale timeline window field and setWindow action from the timeline store
- `2026-06-17-dashboard-state-centralization-W03-P07-S27` - Rewire keyboard timeline stepping to compute from scroll-strip visible range
- `2026-06-17-dashboard-state-centralization-W03-P07-S28` - Rewire event-menu zoom to change scroll offset and scale instead of legacy window state
- `2026-06-17-dashboard-state-centralization-W03-P07-S29` - Rewire timeline-mode entry from salience controls to canonical date and scroll-strip state
- `2026-06-17-dashboard-state-centralization-W04-P08-S30` - Make the stage graph slice hook consume canonical query variables for scope, filter, date range, granularity, lens, and focus
- `2026-06-17-dashboard-state-centralization-W04-P08-S31` - Remove the unfiltered availability graph query and derive availability from the held canonical slice
- `2026-06-17-dashboard-state-centralization-W04-P08-S32` - Make graph controls write representation, granularity, lens, focus, and bounds through canonical dashboard-state mutations
- `2026-06-17-dashboard-state-centralization-W04-P08-S33` - Make scene selection, hover, visibility, and graph bounds subscribe to canonical dashboard state
- `2026-06-17-dashboard-state-centralization-W04-P09-S34` - Make the left browser panel subscribe to canonical selection, filter, and scope state
- `2026-06-17-dashboard-state-centralization-W04-P09-S35` - Make the browser mode store reset only canonical scope-local panel state on scope changes
- `2026-06-17-dashboard-state-centralization-W04-P09-S36` - Make the right rail subscribe to canonical selection and panel tab state
- `2026-06-17-dashboard-state-centralization-W04-P09-S37` - Make timeline controls read filter, date range, lens, and timeline mode from canonical dashboard state
- `2026-06-17-dashboard-state-centralization-W04-P09-S38` - Remove local state fields that duplicate canonical dashboard state after subscribers are migrated
- `2026-06-17-dashboard-state-centralization-W05-P10-S39` - Add Rust route tests for dashboard-state read, patch, validation, tiers, and bounded selected ids
- `2026-06-17-dashboard-state-centralization-W05-P10-S40` - Add frontend stores tests that exercise dashboard-state reads and mutations against a real engine fixture
- `2026-06-17-dashboard-state-centralization-W05-P10-S41` - Add browser integration coverage for date-range changes propagating from timeline to graph and panels
- `2026-06-17-dashboard-state-centralization-W05-P10-S42` - Add browser integration coverage for graph selection propagating to timeline and right rail
- `2026-06-17-dashboard-state-centralization-W05-P10-S43` - Add request-count coverage proving filter and lens changes do not issue duplicate graph queries for availability
- `2026-06-17-dashboard-state-centralization-W05-P11-S44` - Run the frontend typecheck, lint, format check, and vitest suite to exit 0
- `2026-06-17-dashboard-state-centralization-W05-P11-S45` - Run the Rust format, clippy, and test gate to exit 0
- `2026-06-17-dashboard-state-centralization-W05-P11-S46` - Run a vaultspec code-review audit over the completed campaign
- `2026-06-17-dashboard-state-centralization-W05-P11-S47` - Run the codify check for durable state-ownership rules

### plan

- `2026-06-17-dashboard-state-centralization-plan` - `dashboard-state-centralization` plan

### research

- `2026-06-17-dashboard-state-centralization-research` - `dashboard-state-centralization` research: `Dashboard state centralization`
