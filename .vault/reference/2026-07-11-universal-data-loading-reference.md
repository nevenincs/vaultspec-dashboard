---
tags:
  - '#reference'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
related:
  - '[[2026-06-22-graph-filter-fetch-split-adr]]'
  - '[[2026-06-22-mobile-responsive-layout-adr]]'
  - '[[2026-06-25-state-mode-uniformity-adr]]'
---

# `universal-data-loading` reference: `loading-state and streaming architecture audit`

Rag-grounded audit of the dashboard's data-loading, loading-indication, and
streaming architecture, motivated by two observed symptoms: (1) no visible
loading affordance while the frontend pulls multi-MB payloads from the engine;
(2) suspicion that graph data streams from the backend even when the graph is
not displayed (e.g. compact/mobile mode). Sources: the stores wire client and
query layer (`frontend/src/stores/server/engine.ts`,
`frontend/src/stores/server/queries.ts`,
`frontend/src/stores/server/graphSync.ts`), the shell and compact surfaces
(`frontend/src/app/AppShell.tsx`, `frontend/src/app/shell/CompactAppShell.tsx`,
`frontend/src/app/stage/Stage.tsx`,
`frontend/src/app/stage/CanvasStateOverlay.tsx`), the engine SSE route
(`engine/crates/vaultspec-api/src/routes/stream.rs`), and the governing ADRs
(graph-filter-fetch-split, mobile-responsive-layout, state-mode-uniformity,
dashboard-gui).

## Summary

### F1 — Loading indication is per-surface and designed, with no universal layer

Every loading affordance today is a surface-local designed state; there is no
app-level "data is moving" indicator.

- The canvas has the richest treatment: `CanvasStateOverlay.tsx` resolves one
  of `awaiting-scope` / `loading-constellation` / `loading-document` / `empty`
  / `unavailable` / `degraded` / `truncated` / `gpu-unavailable` /
  `context-lost` from stores-derived truth (state-mode-uniformity: skeleton
  bars, sr-only label, no on-screen text). But the loading states fire ONLY
  when `slice === null` (`resolveCanvasState`, line ~109): the FIRST keyframe.
- `useGraphSlice` (`queries.ts:3375`) carries
  `placeholderData: keepPreviousData` (graph-filter-fetch-split ADR D1), so
  every subsequent re-query (filter change, scope switch, lens change,
  invalidation refetch) holds the previous slice on screen — by design the view
  never blanks, but consequently NOTHING signals a fetch is in flight unless a
  consumer reads `isFetching`. Only the salience view does
  (`useSalienceSliceView`, `queries.ts:3538-3557`, feeding the scene's loading
  channel); the canvas overlay and all chrome do not.
- There is no global fetch indicator: `useIsFetching` appears in exactly three
  local panels (`app/right/StatusTab.tsx`, `app/right/RagOpsConsole.tsx`,
  `app/viewer/PlanSummaryCard.tsx`) and nowhere shell-level. No progress-bar
  component exists.
- On compact, the canvas — the one surface with designed loading states — is
  never mounted (mobile-responsive-layout ADR D4), so compact surfaces rely on
  whatever ad-hoc pending state each pane renders.

### F2 — The transport is progress-blind

`engine.ts` resolves every HTTP read with a single buffered
`await response.json()` (e.g. lines ~141, 2379-2410). No `Content-Length`
read, no `ReadableStream` chunk accounting — a multi-MB body yields zero
progress signal between request start and parse completion. TanStack sees one
opaque in-flight promise.

Worse for the observed symptom: the two complete-listing reads drain a
multi-page cursor INSIDE one `queryFn`:

- `vaultTree` (`engine.ts:378-388, ~1895`): walks up to
  `VAULT_TREE_MAX_PAGES = 25` pages × `VAULT_TREE_PAGE_SIZE = 2000` rows
  serially to completion (mandated by the filtering rule: a client-narrowed
  listing must hold the complete set).
- `codeFiles` (`engine.ts:368-376, ~1917`): same shape, 25 × 2000 = 50,000
  rows for the files(code) palette provider.

During such a drain the UI has no page-N-of-M visibility at all — the whole
walk is one `isPending`. This is the most likely producer of the observed
"MBs streaming with no loader" on compact, since the vault tree fires on the
browse surface, which is the compact COLD-DEFAULT surface.

### F3 — Compact mode does NOT fetch the graph (ADR D4 is honored) — the heavy compact reads are elsewhere

Traced plane by plane (mount-site evidence):

- Graph slice (`/graph/query`, the multi-MB bounded payload): production
  consumers are `Stage.tsx:168` (+ availability at :186, bulk neighbors
  at :240), `useCodeModuleLegend` → `CategoryLegend` → `DockWorkspace`, and
  `useGraphNodeFromActiveSlice` → hover card → Stage. All live under the
  DESKTOP branch (`AppShell.tsx:251` → `DockWorkspace` →
  `GraphCanvasHost`). The compact branch (`AppShell.tsx:166-180`) mounts no
  consumer, so the query's `enabled` (scope non-null, `queries.ts:3394`)
  never trips. The graph payload is not fetched on compact.
- Graph SSE (`graph` delta channel): sole mount `Stage.tsx:325`
  (`useGraphLiveSync`, enabled = liveTimeline && scope). Desktop-only. The
  channel carries small capped deltas (feature-delta batch cap 128, ring cap
  256; `graphSync.ts:26`, `stream.rs` ring) — keyframes travel over
  `/graph/query`, not SSE.
- Always-on in BOTH branches: the backend-signal SSE
  (`useBackendSignalSubscription`, `AppShell.tsx:115` →
  `useEngineStream(["backends","git"])`, `queries.ts:9010`) — one
  multiplexed EventSource of small lifecycle/git frames, unconditional, no
  visibility gating; and `useDashboardState` via `useGraphViewModeBridge`
  (`AppShell.tsx:111`) — small.
- Compact heavy reads: the browse surface (cold default,
  `CompactAppShell.tsx:128-130`) fires the FULL vault-tree cursor drain (F2)
  plus `useFiltersVocabularyView`; the timeline surface adds its
  availability/date-criterion/vocabulary reads lazily on tab selection.

So the user-observed "data streamed while the graph is not displayed" is
real but mis-attributed: it is the complete-listing drains (vault tree,
code files) and the always-on signal stream, not the graph slice.

### F4 — Gating today is component-mount only; no visibility axis exists

- The one strategy is mount gating: `shellFrame.compact`
  (`shellLayout.ts:387-400`, matchMedia breakpoint in `viewportClass.ts:40`)
  swaps the whole tree; heavy hooks live inside the components that render
  their data.
- `enabled:` flags exist but key on scope/data availability
  (`useGraphSlice` scope non-null; `useGraphLiveSync` liveTimeline && scope;
  node detail/neighbors on addressable id; embeddings lazily on semantic
  mode entry, `queries.ts:3560+`), never on pane visibility, compact class,
  or `document.visibilityState` (grep: zero hits in `stores`).
- A load-bearing assumption is documented at `queries.ts:503-508`: refresh
  invalidation uses `refetchType: "active"` and warns that a
  mounted-but-`enabled:false` query would not refetch — "no such surface
  today". Any visibility-gating design must reconcile with this.

### F5 — Existing loading/degradation contract the feature must compose with

- Degradation is read from the `tiers` block only (wire-contract rule);
  loading and degradation are already fused in interpreted views
  (`GraphSliceAvailability.loading`, `SalienceSliceView.loading`,
  `useHistoryView`). A universal loading layer must be another stores-owned
  interpreted projection, not a chrome-side guess from transport events.
- state-mode-uniformity ADR: loading is UI-only (kit `Skeleton`, sr-only
  label); any new indicator must use the kit primitives and the token scale.
- SSE connection state already has a designed slice
  (`setLiveStreamConnected`, live-connection degradation) — a template for a
  "stream activity" signal, but it reports connectedness, not data volume.

### F6 — Levers a universal-loading ADR can pull (grounded, not yet decided)

- A stores-owned global activity view: TanStack `useIsFetching`/
  `useIsMutating` (already a dependency) aggregated with stream-connection
  state into one interpreted `useDataActivityView`, consumed by both shell
  branches (desktop chrome + compact `MobileTopBar`) — closing the
  no-indicator gap everywhere without per-surface rework.
- Per-page progress on the cursor walks: `vaultTree`/`codeFiles` accept an
  `onPage(page, rowsSoFar)` callback or write a bounded progress slice, so
  a drain renders "loading N…" honestly instead of one opaque pending.
- Byte-level progress where it matters: the graph keyframe and content reads
  could read `Content-Length` + a `ReadableStream` tee for a determinate
  bar; envelope parsing unchanged.
- Visibility gating: an `enabled` axis for pane/surface visibility (compact
  surface selector, dock pane visibility) and optionally
  `document.visibilityState` for the always-on SSE — must reconcile with the
  `refetchType:"active"` assumption (F4) and never violate
  "filters apply on the engine" (no re-introduction of client masks).
- Deferral/laziness on compact: the vault-tree full drain could be deferred
  or first-page-first (render page 1, continue draining with progress),
  provided the complete-set law for client narrowing is preserved at the
  moment a narrow actually applies.

### Verification note

The symptom report ("MBs streamed in mobile mode") was grounded statically;
the plane-by-plane trace above says graph payloads cannot be the source on a
true compact viewport. Live confirmation (network tab on a compact-width
session: expect vault-tree pages + backends/git SSE only) is a cheap first
step of the implementation plan, and would also catch the alternate
explanation that the observed session was desktop-width (Stage mounted, graph
slice + deltas legitimately flowing).
