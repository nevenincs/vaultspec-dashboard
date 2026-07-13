---
tags:
  - '#adr'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-on-demand-cold-start-reference]]"
  - "[[2026-07-11-universal-data-loading-adr]]"
  - "[[2026-06-22-graph-filter-fetch-split-research]]"
---

# `on-demand-cold-start` adr: `Constellation-first cold start: MBs load on demand, enrichment arrives behind a fast first paint` | (**status:** `accepted`)

## Problem Statement

Cold start must not need MBs before first paint. The census (reference)
shows the one MB-scale cold read is the graph document slice (1.88 MB),
requested at boot solely because a PREVIOUS session's descent persisted
`graph_granularity: document` - while the same scope's constellation is
119 KB and often already cached. The user directive: data is consumed on
demand; UI paints fast initial data and enrichment arrives later, on the
existing shared-state substrate.

## Considerations

- Mount-gating (data-loading-activity rule) already makes fetches
  on-demand per SURFACE; this ADR extends on-demand to PAYLOAD TIER within
  the one surface that legitimately needs MBs (the canvas).
- The scene's granularity-swap path (nav descent) is proven; a progressive
  fill must reuse it, not invent a second data path
  (views-are-projections, view-rewrite-freezes-the-contract).
- Time-travel reads one historical snapshot - progressive fill must not
  substitute constellation data into an as-of view.
- The complete-set law binds client-narrowed listings; pacing the drain is
  allowed, dropping pages is not.

## Considered options

- O1 Trim the document payload server-side (field pruning): real work in
  the engine for maybe 2-3x; does not change the shape of cold start.
  Deferred - orthogonal, can follow.
- O2 Constellation-first progressive slice (chosen): serve the cheap/cached
  feature LOD instantly whenever a cold document-granularity slice is
  requested live; the document slice loads behind it and swaps in via the
  existing set-data path. 16x smaller first paint, zero new wire surface.
- O3 Reset persisted granularity to feature on boot: destroys the user's
  chosen descent (state loss) - rejected.
- O4 New streaming/pagination contract for /graph/query: a wire contract
  event for what O2 achieves client-side - rejected for now.

## Constraints

- Client-plane only; no engine change. Depends on shipped parents:
  universal-data-loading (activity indicator, refreshing banner, drain
  seams), the bounded graph slice cache, the scene set-data contract.
- The progressive window must pass through the SAME `useGraphSlice` cache
  (no second model); the constellation query key is identical to the nav
  descent's, so the fill is a cache SHARE, not a new read family.

## Implementation

- D1 - `useProgressiveGraphSlice` (stores): wraps `useGraphSlice`. When the
  requested slice is document-granularity, LIVE (no `asOf`), and COLD (no
  held/placeholder data), it enables the same-identity feature-LOD query
  and returns its data as the held slice (`isPending` masked false) until
  the document slice lands, then passes through. The availability
  derivation then reports `refreshing` during the fill, so the canvas
  renders the constellation plus the non-blocking refresh banner - never a
  blank skeleton for MBs.
- D2 - Stage consumes the progressive hook in place of the raw slice hook;
  no scene contract change (the doc slice swap rides the existing
  warm-start/reset heuristics the nav descent exercises).
- D3 - Idle-paced drain: the vault-tree continuation pages yield briefly
  between requests so the first paint and first interaction never contend
  with the background drain (small fixed yield; the walk cap still bounds
  the loop; the small first page landed separately).
- D4 - Substrate reaffirmed: shared component state = the one TanStack
  cache + backend dashboard-state + interpreted stores views. No new state
  library; on-demand = mount-gating (surfaces) + payload tiering (D1) +
  paced completion (D3).

## Rationale

The census shows exactly one MB-scale cold read, with a 16x cheaper same-
model projection already served and often already cached. Substituting it
during the cold window is pure win: first paint drops from MBs to ~119 KB,
the user sees the real constellation (not a skeleton), and enrichment
arrives as a designed refresh. Everything rides existing proven paths -
the query cache, the granularity swap, the refreshing banner - honoring
the one-model law and avoiding a wire contract event.

## Consequences

- A persisted-descent cold start briefly shows the constellation before
  the document view - a designed, banner-annotated state, not a flash of
  wrong content; re-ascends are instant thereafter (cache share).
- One extra 119 KB query per cold descended boot (skipped when the
  constellation is already cached).
- Time-travel and focus/ego reads bypass the progressive path by design.
- Server-side document-payload pruning (O1) remains open as follow-up.

## Addendum (same day): the JS bundle census

Benchmarking after acceptance showed the MOBILE cold load is dominated by
JavaScript, not wire data: the eager bundle was 9.7 MB (1.85 MB gzip)
because the chunk strategy pinned shiki's lazily-imported grammar registry
into the one eager vendor chunk. Two decisions extend this ADR under the
same principle (only what a surface renders may load eagerly):

- D5 - Pre-hydration boot shell: an inline static skeleton in the HTML
  document paints in ~50 ms, before any bundle downloads, and retires on
  the app shell's first commit. The one sanctioned literal-value style
  island (pre-token boot, mirroring the scene literal-hex precedent).
- D6 - Lazy registries stay lazy: modules reached only through dynamic
  import thunks (shiki grammars/themes) are never pinned into an eager
  chunk; the WebGL scene stack is isolated as its own cacheable chunk.
  Eager JS drops to ~2.2 MB (~620 KB gzip). FOLLOW-UP: fully deferring
  the scene chunk is blocked on the `sceneController` -> `cameraCore` ->
  `three` import edge - decoupling that is a reviewed scene-contract
  event, deliberately not done ad hoc here.
