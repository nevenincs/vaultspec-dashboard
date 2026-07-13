---
tags:
  - '#audit'
  - '#state-render-review'
date: '2026-07-02'
modified: '2026-07-12'
related: []
---

# `state-render-review` audit: `application-wide state and rendering`

## Scope

One surface of the standing architecture-review program: application-wide STATE +
RENDERING, audited end to end against the governing rules (`dashboard-layer-ownership`,
`views-are-projections-of-one-model`, `stable-selectors`,
`display-state-is-backend-served-not-frontend-derived`,
`every-wire-response-carries-the-tiers-block` /
`degradation-is-read-from-tiers-not-guessed-from-errors`,
`one-filter-authority-every-corpus-view-consumes-it`,
`bounded-by-default-for-every-accumulator`,
`client-narrowed-listings-hold-the-full-paginated-set`). Areas swept: the single
dashboard-state authority (`frontend/src/stores/server/dashboardState.ts`), the TanStack
query cache + SSE graph delta clock (`frontend/src/stores/server/graphSync.ts`,
`queries.ts`, `liveStatus.ts`), every zustand/`useSyncExternalStore` selector in
`frontend/src/stores/` and `frontend/src/scene/`, the view layer
(`frontend/src/app/`) for layer-ownership violations, and accumulator bounding across
the stores layer. A sibling review audits keyboard-nav + action correctness in
parallel; action/keymap/clipboard files were left to it. Read-only pass; foreign
mid-flight WIP noted under SRR-INFO-7.

## Findings

### filters-read-modify-write-race | medium | Rapid facet toggles can lose an update: the filters record has no write serialization

SRR-001. Every filter write reads the cached `DashboardState.filters`, applies a pure
builder, and PATCHes the WHOLE `filters` record
(`toggleFilterFacet` / `setTextFilter` / `setFeatureQuery` / `clearFilterFacet` in
`frontend/src/stores/server/dashboardState.ts`, and the imperative twins
`toggleDashboardFilterFacet` / `setDashboardFeatureFilter`). The cache is updated only
in `onSuccess`, so two writes inside one round-trip window both read the SAME base:
click facet A (base `{}`, PATCH `{statuses:[x]}`), click facet B 50ms later (base still
`{}`, PATCH `{health:[y]}`) — the engine merges `filters` as one top-level field, so
the second PATCH silently erases facet A. The post-write `invalidateQueries` refetch
converges the CACHE to server truth but cannot restore the lost update — the server
truth itself lacks facet A. The codebase already acknowledges this hazard class for
the two other racy writers in the SAME FILE: `panel_state` writes are serialized
through `queuePanelStateWrite` (a per-scope promise chain reading
`pendingPanelStatesByScope`), and `timeline_mode` writes carry per-scope seq tokens
(`beginDashboardTimelineModeWrite` / `acceptDashboardTimelineModeWrite`). The filters
record — the most-clicked shared intent — has neither. Directly implementable: reuse
the panel-state chain shape (queue the write, compute the payload from the freshest
cache INSIDE the queued thunk) or, decision-gated, extend the engine PATCH grammar to
facet-level deltas.

### derive-inside-selector-sites | low | Eight selectors still derive inside the selector body — safe today, the exact crash shape four times over

SRR-002. `stable-selectors` binds: select RAW stable state, derive in `useMemo`, and
`useShallow` does not lift the constraint. Eight production selectors still call a
`normalize*`/`derive*` INSIDE the selector: `addProjectChrome.ts:77`,
`createDocChrome.ts:146`, `worktreePickerChrome.ts:228` (fresh object per snapshot —
safe only because every field is a primitive), `selection.ts:177` and
`workingSet.ts:99` (fresh string[] per snapshot — safe only because `useShallow`
element-compares primitives), `editor.ts:286` (`deriveDocumentEditorView`, flat
primitives), `graphSync.ts:134` (safe only because the write side canonicalizes so the
read-side `normalizeGraphFeatureDeltas` hits its identity-return path), and
`ragControl.ts:597` (primitive + stable action refs). None loops TODAY, but each is
one nested non-primitive field away from the `getSnapshot should be cached` →
`Maximum update depth exceeded` crash that has recurred four times (the codified
history in `stable-selectors`), and the safety of `graphSync.ts:134` is a non-local
invariant (read-path identity depends on write-path canonicalization). Directly
implementable, mechanical: convert each to the select-raw + `useMemo` shape already
used by `contextMenu.ts:572`, `shellLayout.ts:434`, `graphOverlays.ts:21`, and
`tabs.ts:215`.

### write-then-invalidate-double-fetch | low | Every dashboard-state write triggers a redundant GET; the backstop intent is undocumented

SRR-003. `updateDashboardStateCache` (`dashboardState.ts:242`) sets the PATCH
response — already the full merged server state — into the cache, then immediately
`invalidateQueries` the same key, refetching for every active observer. The refetch is
a plausibly deliberate convergence backstop for out-of-order PATCH responses (the
second-resolved stale response wins `setQueryData`; the refetch converges), but no
comment says so, and the cost is one extra `GET /dashboard-state` per intent write
(every selection click, facet toggle, panel resize commit) multiplied across every
observing surface. Directly implementable: document the backstop intent where the
invalidate lives, or replace it with a targeted guard (e.g. skip the invalidate when
no other write is in flight).

### edge-event-selection-view-local | low | Edge/event selection metadata is an acknowledged private copy beside the canonical selected_ids

SRR-004. `viewStore.ts:209` holds `selection: Selection` — edge/event selection
metadata documented in-source as "not yet represented in dashboard-state" — while node
selection rides the canonical backend `selected_ids` (one record, one write seam).
The view store validates it against slice churn (pruning invalid node ids), and the
canonical node id IS written through `patchDashboardState` on selection, so the
split-brain risk is limited to the supplementary edge/event payload: a surface reading
only dashboard-state cannot see WHICH edge/event the selection came from. Decision-
gated: either promote the entity-selection metadata onto dashboard-state (if any
second surface ever needs it) or re-document it as deliberately view-local chrome; the
current comment ("not yet") leaves the intent ambiguous for the next agent.

### state-authority-sound | info | One record, one write seam, session-keyed identity — verified sound

SRR-INFO-1. `engineClient.patchDashboardState` has exactly three call sites, all in
`dashboardState.ts`, all landing in `updateDashboardStateCache`; no surface holds a
private copy of shared intent (no `useState` in `frontend/src/app/` shadows selection,
filters, date range, panel, or granularity — swept). The dashboard-state cache key
joins the backend session identity (`dashboardStateSessionIdentity`) so a session swap
cannot serve another session's cached intent, and the read hook threads TanStack's
AbortSignal so a scope swap cancels cleanly. The one-filter-authority law holds: the
graph query forwards every reducing facet to the engine (`dashboardGraphFilter`), the
timeline consumes the same record via `dashboardLineageFilterArg` (date range
deliberately excluded — the timeline owns the date axis), and the settings seeds
(`confidence_floor`, `label_filter`) initialize rather than shadow the canonical
filter, with the intent pinned in comments.

### sse-delta-clock-sound | info | The graph SSE clock is generation-safe and bounded — verified sound

SRR-INFO-2. `graphSync.ts` handles the full failure surface: forward seq gaps AND
backward seq resets (engine restart / clock reset) both discard the partial batch and
re-keyframe; a reconnect that resumes to an EMPTY stream (the engine-restart
signature) also re-keyframes; delta bursts collapse through a 150ms debounced,
scope-keyed invalidation; a clean feature-only batch splices with NO refetch. Bounds:
`GRAPH_FEATURE_DELTAS_CAP` 128, `STREAM_RETENTION` 256-chunk ring with seq-dedup
reducer, stale since-keyed stream entries explicitly `removeQueries`-ed on keyframe
advance, stream `gcTime` 30s, capped exponential reconnect backoff. The per-scope
stream key prevents two scopes sharing a clock.

### degradation-honesty-sound | info | Tiers are read where the rules demand, with fresh-error-wins precedence — verified sound

SRR-INFO-3. No component in `frontend/src/app/` or `frontend/src/scene/` calls
`fetch`/`EventSource` or reads the raw wire `tiers` block (the `.tiers` hits in
`Inspector.tsx`/`CanvasStateOverlay.tsx` are derived view props from stores hooks).
The scene imports only wire TYPES (`sceneMapping.ts`). `degradationInputs.ts` derives
the degradation conditions from the status snapshot's tiers block inside the stores
layer and hands the app matrix pure derived inputs (with the referential-stability
memo). `searchController.ts` implements the honesty law exactly: tiers read off the
ERROR envelope when present (freshest truth wins over a held success), and a
tiers-less transport fault is distinguished from a degraded tier. The graph slice
additionally bounded-polls (4s, self-clearing predicate) while a held tiers block
reports a tier mid-build, so degradation truth cannot go stale under the no-refetch
delta path.

### bounding-discipline-sound | info | Accumulator bounds hold across the stores layer — verified sound

SRR-INFO-4. Query cache defaults are bounded (staleTime 5s, gcTime 120s); the only
`staleTime: Infinity` entries carry explicit justifications and bounds
(`useSettingsSchema` gcTime 60s; the stream options gcTime 30s + 256-ring; the
timeline view-state record is ONE fixed key of fixed shape — bounded by construction,
its `gcTime: Infinity` holds a single small object). The `*_CAP` discipline is
pervasive (openDocs LRU at `MAX_OPEN_DOCS`, `OPENED_IDS_CAP`, `WORKING_SET_CAP`,
`LIVE_BROKEN_LINK_COUNT_MAX`, hover/palette/expansion caps). The module-scope maps in
`dashboardState.ts` (pending panel states, write chains, timeline seq tokens) are
scope-keyed and deleted on completion. `engineClient.vaultTree` walks its cursor to
completion under `VAULT_TREE_MAX_PAGES` 25 — the
client-narrowed-listings-hold-the-full-paginated-set fix holds.

### render-path-sound | info | View-local vs shared intent is split correctly; hover never round-trips

SRR-INFO-5. Hover is view-local only (`viewStore.hoveredId`), with the historical
per-pointer-move PATCH flood documented in-source as the reason — the fix holds.
Timeline scrub/zoom/lane state is view-local chrome per the rules; the shared
`timeline_mode` rides dashboard-state with out-of-order write tokens. The graph slice
uses `keepPreviousData` so filter churn never blanks the canvas, and the code-corpus
request identity pins the facets the engine rejects so a vault-filter toggle cannot
re-key a byte-identical code slice. Graph-generation invalidation flows through the
single owners `invalidateGraphGenerationReads` / `invalidateGitRecoveryReads` /
`invalidateScopedSemanticReads` rather than hand-composed key lists.

### selector-conventions-held | info | The select-raw-derive-in-useMemo convention is the norm

SRR-INFO-6. Outside the eight SRR-002 sites, the swept selectors follow the codified
shape: `contextMenu.ts` selects raw fields under `useShallow` and assembles the typed
snapshot in `useMemo` (with the rationale commented), `shellLayout.ts` selects flat
primitives, `tabs.ts` serializes to a primitive string snapshot for
`useSyncExternalStore`, `graphOverlays.ts` / `useIsProvisionalDoc` select raw and
memo, and `viewportClass.ts` returns a primitive. No `.map`/`.filter`/object-literal
selector exists outside `useShallow`, and `frontend/src/scene/` contains no zustand
stores at all (data arrives via `SceneController` commands).

### foreign-wip-noted | info | Mid-flight foreign WIP present in the shared worktree

SRR-INFO-7. The shared worktree carries another team's uncommitted work: the
`engine/crates/vaultspec-api/src/authoring/` module plus modified
`vaultspec-api` lib/routes and the agentic-spec-authoring `.vault/` docs (the
2026-06-30 plan/exec/audit set). None of it was touched or audited here; the
state+rendering surface swept is the committed frontend stores/app/scene code.

## Recommendations

- Serialize the filters write path (SRR-001): compute the PATCH payload from the
  freshest cache inside a per-scope queued write, reusing the `queuePanelStateWrite`
  shape that already lives in the same file. Alternatively (decision-gated), extend
  the engine PATCH grammar to accept facet-level deltas so concurrent facet writes
  merge server-side.
- Mechanically convert the eight SRR-002 selectors to select-raw + `useMemo`. Given
  the four codified recurrences of this crash class, consider a lint guard (an ESLint
  rule or a grep-shaped guard test) rejecting function calls inside `useShallow`
  selector bodies, so the convention stops depending on review vigilance.
- Document the `updateDashboardStateCache` invalidate as the out-of-order-response
  convergence backstop it appears to be, or gate it to writes that actually raced
  (SRR-003).
- Decide the home of edge/event selection metadata (SRR-004): promote onto
  dashboard-state when a second consumer appears, or re-comment as deliberately
  view-local.
