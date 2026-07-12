---
tags:
  - '#adr'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
related:
  - '[[2026-07-11-universal-data-loading-reference]]'
  - '[[2026-06-22-graph-filter-fetch-split-adr]]'
  - '[[2026-06-22-mobile-responsive-layout-adr]]'
  - '[[2026-06-25-state-mode-uniformity-adr]]'
---

# `universal-data-loading` adr: `One data-activity plane: universal loading state, drain progress, and gated always-on streams` | (**status:** `accepted`)

## Problem Statement

Two observed symptoms, grounded by the reference audit:

1. **Multi-MB reads render no loading affordance.** Loading indication today is
   per-surface and designed (the canvas overlay's skeleton states), but the
   canvas shows loading only for the FIRST keyframe (`slice === null`); every
   re-query hides behind `keepPreviousData`, no shell-level indicator exists
   (`useIsFetching` appears in three local panels only), and the transport is
   progress-blind — every read is one buffered `response.json()`, and the two
   complete-listing reads (`vaultTree`, `codeFiles`) drain up to 25 × 2000-row
   pages serially INSIDE one `queryFn`, invisible as anything but a single
   opaque pending. On compact the one surface with designed loading states (the
   canvas) is never mounted, so the cold-load vault-tree drain — the likely
   observed "MBs with no loader" — shows nothing.

2. **Suspected graph streaming while the graph is hidden (mobile).** The trace
   DISCONFIRMS this for the graph planes: `/graph/query` and the `graph` SSE
   channel are fully mount-gated out on compact (mobile-responsive-layout ADR
   D4 honored — no consumer mounts, `enabled` never trips). What actually
   flows on compact is the browse surface's full vault-tree cursor drain, the
   filters vocabulary, and the always-on `backends`+`git` signal SSE — all
   mount-gated by component, with no visibility axis anywhere.

The gap is architectural, not cosmetic: there is no single place that KNOWS
data is moving. This ADR decides the one data-activity plane and the payload
optimizations riding on it.

## Considerations

- Layer law: any activity truth must be a stores-owned interpreted projection;
  chrome renders it, never derives it (dashboard-layer-ownership). Degradation
  stays read from `tiers`, never guessed from transport events.
- `keepPreviousData` on the graph slice is a deliberate accepted decision
  (graph-filter-fetch-split D1: never blank on filter change) — the fix must
  add signal, not remove hold-previous.
- The complete-listing law (filtering rule): a client-narrowed listing must
  hold the complete paginated set — any progressive rendering must not let
  matches beyond the loaded prefix vanish silently.
- The `refetchType: "active"` invalidation contract assumes no
  mounted-but-`enabled:false` query exists today; a new visibility-`enabled`
  axis would silently break refresh for gated surfaces.
- state-mode-uniformity ADR: loading is UI-only (kit `Skeleton`/primitives,
  sr-only labels, tokens); no bespoke spinner.
- Every accumulator bounded at creation (resource-bounds rule).

## Considered options

- **O1 Per-surface patching** (add `isFetching` affordances surface by
  surface): no new plane, but re-authors the same truth N times, misses
  compact, and leaves the drains opaque. Rejected.
- **O2 One stores-owned data-activity projection** aggregating TanStack
  fetch/mutation counts + drain progress + stream connectedness, rendered by
  one indicator per shell branch. Chosen — one authority, both shells, O(1)
  new chrome.
- **O3 Transport rewrite to streaming reads** (ReadableStream byte progress on
  every route): maximal fidelity, but touches every client method for signal
  most reads don't need; `Content-Length` is unreliable under chunked
  encoding. Rejected as the general mechanism; page-level drain progress
  gives determinate signal where the real bytes are.
- **Visibility gating — O4a `document.visibilityState`-`enabled` queries**:
  breaks the `refetchType:"active"` contract, risks stale surfaces on return.
  Rejected for queries. **O4b hidden-tab pause for the always-on signal SSE
  only**: safe (streams re-snapshot on resubscribe), bounded benefit. Chosen
  narrowly. **O4c keep mount-gating canonical and codify it**: chosen as the
  standing law (it already works — the graph planes prove it).
- **Progressive listing — O5a keep monolithic drain** (status quo): simplest,
  but the largest payload stays a single opaque pending. **O5b first-page
  render + background drain with honest narrowing gate**: chosen — page 1
  paints immediately, the drain continues with visible progress, and
  client-narrow controls surface an honest "still loading the full list"
  state until the set is complete (the complete-set law holds at the moment a
  narrow applies).

## Constraints

- No engine change is required for D1–D5 (drain progress, activity state, and
  the progressive tree render are all client-plane). Byte progress (rejected
  O3) would have needed engine `Content-Length` guarantees.
- The activity store slice and the drain-progress slice are bounded scalars
  (counters + a small fixed record per active drain), pruned on settle.
- Depends on stable parents: TanStack Query (already the cache), the kit
  Skeleton/state primitives (shipped), the compact shell (shipped, stable).
- The indicator must pass the full lint gate (tokens, no px, labels
  user-facing) and the guard suites (no new fetch in chrome, no raw tiers).

## Implementation

- **D1 — One data-activity projection.** A stores-owned
  `useDataActivityView` aggregates: TanStack `useIsFetching` +
  `useIsMutating` (excluding the always-on SSE stream queries by key
  predicate, which would otherwise read as perpetually fetching), the
  drain-progress slice (D3), and stream connectedness (existing
  live-connection slice). It serves one interpreted shape:
  `{ active: boolean, determinate: { loaded, ofAtLeast } | null, kind }`,
  debounced with a show-grace (~300ms) and a minimum-visible hold so it never
  flickers on cache hits. Chrome consumes it; nothing else re-derives
  activity.
- **D2 — One indicator per shell branch.** Desktop: a slim non-blocking
  activity bar in the existing chrome frame. Compact: the same primitive in
  `MobileTopBar`. Both are kit-composed (state-mode-uniformity: UI-only,
  sr-only "Loading data"), rendered from D1 only. The canvas overlay's
  designed states stay untouched; this is the universal floor beneath them.
  Additionally the graph stage gains the held-slice refetch affordance it
  lacks: `CanvasStateOverlay` reads the slice's `isFetching` (already
  interpreted for salience) as a corner "refreshing…" banner, never blanking
  the held field.
- **D3 — Determinate drain progress.** `vaultTree`/`codeFiles` cursor walks
  report per-page progress (`pagesLoaded`, `rowsLoaded`, `complete`) into a
  bounded drain-progress slice keyed by listing id, written from the wire
  client via a narrow seam (no chrome import). D1 renders it determinate
  ("2,000… 4,000… rows"); the slice entry is deleted on settle/error.
- **D4 — Mount-gating codified; hidden-tab pause for the signal SSE.**
  Mount-gating stays the canonical visibility mechanism (codification
  candidate: a rule stating heavy hooks live only in the components that
  render their data; no `document.visibilityState`-`enabled` queries). The
  one always-on plane — the `backends`+`git` signal EventSource — gains a
  hidden-tab pause: after a grace period with `document.hidden`, the
  subscription closes; on visibility it resubscribes and re-snapshots.
  Bounded, resume-safe, and it never touches the graph SSE (which is
  mount-gated already).
- **D5 — Progressive vault-tree listing.** The vault-tree read renders its
  first page immediately and continues the drain in the background with D3
  progress; while `complete === false`, the rail's client-narrow controls
  render the honest partial state (narrowing allowed but visibly "searching a
  list that is still loading — N of ≥N rows") and re-run when the drain
  completes, preserving the complete-set law at every narrow. `codeFiles`
  (palette provider) keeps the monolithic drain — the palette opens on
  demand and D3 already makes it visible.

## Rationale

The reference audit showed the two symptoms share one root: activity truth is
fragmented per surface and absent at the shell, while the largest payloads
(the listing drains) are structurally invisible to any indicator. One
stores-owned projection (O2) fixes both shells at once without touching the
deliberate `keepPreviousData` behavior; page-level drain progress (D3) puts
determinate numbers exactly where the megabytes actually move, at a fraction
of O3's cost. The mobile suspicion was disconfirmed — mount-gating already
keeps graph payloads off compact — so the honest decision is to codify that
mechanism (O4c) and trim the one genuinely always-on stream (O4b), not to
build a speculative visibility-gating axis that would break the
`refetchType:"active"` contract (O4a).

## Consequences

- Every surface, desktop and compact, gets a loading floor for free; new
  surfaces inherit it without per-surface work.
- The vault-tree cold load on compact — the worst observed case — becomes
  first-page-interactive with visible progress instead of an opaque
  multi-page stall.
- The activity indicator is a new global signal: it must be tuned (grace +
  hold) or it becomes noise; the SSE-exclusion key predicate is a
  maintenance point when new stream queries land.
- D5 introduces a partial-listing state the rail must render honestly; the
  guard tests must cover "narrow during drain" so matches beyond the loaded
  prefix never silently vanish.
- Hidden-tab SSE pause means backend signals resume with a snapshot gap on
  return — acceptable (the stream re-snapshots), but Status surfaces must
  not read the gap as degradation.
- Codification candidate: the mount-gating law (heavy hooks live only under
  the components that render their data) promoted to a project rule.
