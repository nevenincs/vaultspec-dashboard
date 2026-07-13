---
tags:
  - '#reference'
  - '#frontend-state-system'
date: '2026-06-13'
modified: '2026-07-12'
related:
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-13-dashboard-live-state-adr]]"
  - "[[2026-06-13-dashboard-platform-adr]]"
  - "[[2026-06-12-dashboard-gui-adr]]"
---

# `frontend-state-system` reference: `frontend state system blueprint`

The authoritative blueprint of the frontend's complete state system - the system that
expresses, manipulates, stores, and manages the types, data, and states of the
application. It is the delivery map for the Data and State layer (`frontend/src/stores/`,
the sole client of the engine wire) and the state-bearing machinery coupled to it (the
scene delta clock, the time-travel driver, the degradation derivation, and the platform
dispatch and failure seams). Every entry cites its source file and its verification
status, so a future agent can read the whole state system as one owned, conformant,
tested deliverable rather than scattered code. Grounded in the wire contract
(`2026-06-12-dashboard-foundation-reference`) and the four binding ADRs (foundation, gui,
platform, live-state).

## Summary

### The three-tier discipline (the spine)

State is partitioned into three tiers with one-way boundaries (gui-spec §5.2):

- **Server state -> TanStack Query** (`stores/server/`): every engine read flows through
  the query cache, keyed by the contract's `(scope, filter, as_of, granularity)`
  cacheability unit. The sole wire client.
- **View state -> Zustand** (`stores/view/` + `stores/server/liveStatus.ts`): selection,
  working set, filters, lenses, pins, timeline mode, panel layout, live-connection.
- **Per-frame scene state -> the scene layer** (`scene/`): positions, LOD, animation -
  never in React, fed only through `SceneController` commands.

The state system is delivered against the four mandate verbs as follows.

### EXPRESS - the type system (complete, contract-conformant)

Domain types are single-sourced as the snake_case wire shapes in
`stores/server/engine.ts` and mirrored into view-state types under `stores/view/`. Every
wire-contract family has a type, and every §2 response carries the per-tier `tiers`
block:

- §2 identity/tiers: `TiersBlock`, stable node/edge `id`, `WireMetaEdge` (collision-safe
  synthesized id) - `engine.ts`, `liveAdapters.ts`.
- §3 map/vault-tree, §4 graph (`EngineNode`/`EngineEdge`/`GraphFilter`/`GraphSlice`/
  `FiltersVocabulary`/`NodeDetail`/`NodeEvidence`), §5 temporal
  (`EngineEvent`/`EventBucket`/`GraphDeltaEntry`/`GraphDiffResponse`/`GraphAsofResponse`),
  §6 status/ops (`EngineStatus`/`OpsResult`), §8 search (`SearchResult`/`SearchResponse`)
  - all in `engine.ts`.
- View/state types: `TimelineMode`, `Selection`, `ViewState`, `TierFilter`
  (`view/viewStore.ts`); `FilterState`/`VisibilityMembership` (`view/filters.ts`);
  `Lens`/`PinState` (`view/lenses.ts`, `view/pins.ts`); `LiveStatusState`
  (`server/liveStatus.ts`); `DegradationInputs`/`LiveSignals`/`SurfaceStates`
  (`app/degradation/matrix.ts`); `FailureKind`/`StreamLostError`/`WorkerCrashError`
  (`platform/policy/failurePolicy.ts`). Live-origin divergences are absorbed by tolerant
  adapters in `liveAdapters.ts`, never by forking the type.

### MANIPULATE - the mutation seams (complete; the unified seam now adopted)

- View-store actions mutate view state (`viewStore` select/scope/working-set/tier/timeline,
  `filters` set/apply/reset, `lenses` save/apply/remove, `pins` toggle, `liveStatus`
  set/reset) and bind outward to the scene via `bindSelectionToScene`/`bindPinsToScene`.
- Server mutations: the whitelisted ops verbs (`OpsPanel`, R1 whitelist).
- The unified intent seam: the platform dispatch pipeline
  (`platform/dispatch/`) - `Dispatcher` + middleware (trace -> log -> confirm-guard) +
  `useAction`/`useDispatch`/`useConfirmable`. As of the delivery completion (B-1) the
  ops surface routes through it (`app/right/opsActions.ts`, `OpsPanel` fires via
  `dispatchOps`), so every ops intent is logged, traced, and centrally guardable - the
  seam's first real adopter, realizing "manipulate through one seam".

### STORE - the caches and slices (complete)

- TanStack Query cache + the `engineKeys` factory (`stores/server/queries.ts`): keys on
  `(scope, filter, as_of, granularity)`; `stream` keys on `(channels, since)`; failures
  route through the platform failure policy with a taxonomy-driven retry predicate
  (`queryClient.ts`).
- View stores (zustand): `viewStore` (the shared brain), `filters`, `lenses`, `pins`;
  the `liveStatus` live-connection slice (`streamConnected`/`lastSeq`/`brokenLinkCount`,
  monotonic seq); the degradation debug-override store (`app/degradation`).
- The single delta clock (`scene/deltaLog.ts`): keyframe + ordered delta log on one
  monotonic seq; idempotent splice (dups <= lastSeq dropped); gap detection flips
  `needsKeyframe`; seq-driven cursor (finding 005).

### MANAGE - the state machines (complete; reachable + tested)

- Timeline mode (live <-> time-travel): `viewStore.timelineMode` ->
  `timeTravel.useTimeTravel` -> `TimeTravelDriver` keyframe+replay.
- Selection (one concept, all regions) with scene-origin focus-bounce suppression.
- Degradation derivation: `deriveInputs` (pure, reads injected live signals) -> `matrixFor`
  -> `useSurfaceStates`; the stream-lost and structural-broken rows now derive from real
  state (finding 036 closed).
- Live-connection/stream lifecycle: `useGraphLiveSync` (connection -> slice; deltas ->
  invalidation), `sseChunks` (clean-done vs `StreamLostError` vs intentional abort), the
  policy binding flipping the signal (live-state D5).
- Scope-swap wholesale reset: `viewStore.setScope` resets filters, re-keys pins/lenses,
  and resets the live-connection slice (B-2) - no cross-scope bleed (findings 018/022/023).

### Verification status (delivered)

The whole state system is green: the `stores` test surface plus the `app/degradation`,
time-travel, and dispatch tests pass; the adversarial conformance suite
(`stores/__adversarial__/`, the data-plane hardening campaign's reproduction tests) is
green; typecheck, lint, and production build are clean; the live adverse e2e renders the
degraded surfaces. The four binding ADRs each carry a PASS audit.

### Engine-blocked (flagged, not built; do not work around client-side)

- **S50 - no-refetch live constellation delta animation.** Applying live `graph` deltas
  onto the held scene model with seq dedup needs the constellation keyframe's `seq`, but
  the live constellation keyframe (`/graph/query`, feature granularity) carries none, and
  constellation-granularity `asof`/`diff` is the open S50 divergence. The client is built
  up to the boundary (`TimeTravelDriver.spliceLive` exists, `useGraphLiveSync` does
  invalidation only, `lastSeq` is staged) and stops there per `engine-read-and-infer`.
  When the engine unblocks S50, thread `lastSeq` into the live subscription and swap
  invalidation for the delta animation.
- **`dateMandateMissing` degradation row** can be triggered only by the dev debug switch
  until the engine surfaces a `date-mandate` signal in `/status` (contract §6); the
  adapter half is a one-line map once the engine names it.
- **Evidence excerpt/content preview** (`NodeEvidence` carries `{path, doc_type}` only) -
  deferred to a future engine rev (contract §11 W1).

### Where each part lives (index)

- `stores/server/`: `engine.ts` (wire client + types), `queries.ts` (query hooks, keys,
  SSE consumption), `liveAdapters.ts` (live-origin anti-corruption), `queryClient.ts`
  (cache + policy wiring), `liveStatus.ts` (live-connection slice), `graphSync.ts` (live
  reactivity hook).
- `stores/view/`: `viewStore.ts`, `filters.ts`, `lenses.ts`, `pins.ts`, `selection.ts`.
- coupled state machinery: `scene/deltaLog.ts`, `app/timeline/timeTravel.ts`,
  `app/degradation/{matrix.ts,useDegradation.ts}`, `app/right/opsActions.ts`.
- platform seams the state system consumes: `platform/dispatch/`, `platform/policy/`.
