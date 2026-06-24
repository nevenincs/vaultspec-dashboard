---
tags:
  - "#audit"
  - "#unified-filter-plane"
date: '2026-06-22'
related:
  - "[[2026-06-22-unified-filter-plane-plan]]"
promoted_to:
  - 'rule:one-filter-authority-every-corpus-view-consumes-it'
modified: '2026-06-24'
---
# `unified-filter-plane` audit: `unified filter plane review`

## Scope

The mandatory review (plan phase P05.S15) of the `unified-filter-plane`
implementation against its accepted ADR: one global filter authority driving the
rail, graph, and timeline bidirectionally, with the filter-vs-visibility intent law
fenced by a structural guard. The review covered the eleven campaign-touched files
across the engine temporal route, the timeline-consumer plumbing, the
`CategoryLegend` rewire, the retirement of the canvas-local visibility mask, and the
guard/test extensions. Sibling campaigns' uncommitted changes in the shared worktree
were deliberately excluded.

## Findings

Verdict: PASS. No CRITICAL, HIGH, or MEDIUM findings. The implementation realizes
ADR decisions D1-D6 and respects every cited rule.

- Layer ownership (PASS): the rewired legend reaches the wire only through stores
  hooks (`useActiveScope`, `useVaultRailFacets`, `useDashboardFilterSidebarIntent`),
  routing to the same `toggleFilterFacet` write seam the rail KIND section uses — no
  direct fetch, no raw `tiers`, no private store mutation. The timeline stays a pure
  consumer with no new fetch.
- Selector discipline (PASS): `useTimelineLineageFilterArg` and the legend's
  `activeDocTypes` Set both select the raw stable slice and derive in `useMemo`,
  never building a fresh reference inside a store selector.
- Bounded queries (PASS): `/graph/asof` routes the parsed filter through the same
  `graph_query` the live query uses, preserving the node ceiling and self-consistent
  edge pruning; the new engine test proves a `doc_types` descent narrows and drops
  the dangling edge. The filter only narrows.
- Mock/live fidelity (PASS): the `/graph/asof` filter param uses the identical
  URL-encoded-JSON parse block as `/graph/lineage`; the live transport test asserts
  the encoded facet on the real wire.
- Engine read-and-infer (PASS): the asof change is parameter-plumbing over the
  shipped `Filter` grammar — no new filtering semantics.
- Correctness (PASS): `dashboardLineageFilterArg` correctly excludes `date_range`
  (the timeline owns the date axis) and coalesces the empty-facet case to
  `undefined`; the category-to-doc_type token mapping makes cross-wiring structural;
  inclusion semantics are coherent; the retired `hiddenCategories` slice leaves no
  dangling references in production source.

LOW (non-blocking):

- The stores test covers the one-refetch-on-filter-change half of S07 but not an
  explicit no-refetch-on-viewport-nudge assertion. Mitigated structurally: the
  timeline passes a constant empty range, so the viewport never enters the lineage
  query identity by construction — a stronger guarantee than a test.
- The timeline deliberately omits `asOf` on its lineage read (marks render the live
  corpus; the playhead drives stage time-travel only), consistent with the
  pre-existing timeline contract. D4's filtered time-travel lands on the
  `/graph/asof` stage path, not the timeline marks.

## Recommendations

Ship as-is. Optionally add an explicit no-refetch-on-viewport assertion to the
timeline lineage tests for documentation value.

Browser-visual verification (P05.S14) is now COMPLETE: with both MCP browsers
profile-locked by concurrent instances, an ephemeral-profile Chromium was launched
directly via the bundled `playwright` against the live dev app. Network interception
proved that one click on the graph legend "Plans" fires `PATCH /dashboard-state`
(canonical `doc_types` write), then `POST /graph/query` (graph narrows) and
`GET /graph/lineage?filter={"doc_types":["plan"]}` (timeline narrows) — the legend
button goes `aria-pressed=true` with the others dimmed, the graph collapses to a
plan-only scatter, the timeline thins to match, and a second click restores all
surfaces. Full bidirectional cross-wiring confirmed live.

EVERY advanced-filter facet was then verified live the same way (ephemeral-profile
Chromium, network interception against the running app), each from its authoring
surface:

- `doc_types` — graph legend "Plans" -> `filter={"doc_types":["plan"]}`.
- `plan_states` — flyout PLAN STATUS "In progress" -> `filter={"plan_states":["in-progress"]}`
  (the progress-derived state — not-started / in-progress / finished — not a lifecycle tier).
- `statuses` — flyout DECISION STATUS "Accepted" -> `filter={"statuses":["accepted"]}`.
- `health` — flyout HEALTH "Dangling" -> `filter={"statuses":["accepted"],"health":["dangling"]}`.

Each click set its checkbox/pressed state, fired `PATCH /dashboard-state` (the
canonical write), and refetched `POST /graph/query` + `GET /graph/lineage?filter=...`
so the graph and timeline narrowed together. The HEALTH click's lineage URL carried
BOTH `statuses` and `health`, proving facets COMPOSE on the single
`dashboardState.filters` record rather than each owning a private slice — the
unified-filter-plane invariant confirmed end-to-end across every facet.

## Codification candidates

The ADR already carries the codification candidate
`one-filter-authority-every-corpus-view-consumes-it` (extending
`filtering-has-one-canonical-surface` from control PLACEMENT to control INTENT plus
universal CONSUMPTION). Per the codify discipline it binds only after holding across
one full subsequent cycle, so it is recorded as a candidate here and NOT promoted in
this pass. No new codification candidates surfaced from the review.

