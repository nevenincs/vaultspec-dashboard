---
tags:
  - '#plan'
  - '#unified-filter-plane'
date: '2026-06-22'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-06-22-unified-filter-plane-adr]]'
  - '[[2026-06-22-unified-filter-plane-research]]'
---

# `unified-filter-plane` plan

### Phase `P01` - Backend temporal wire parity

Every engine endpoint that projects the corpus accepts the same canonical Filter, so time-travel and the event lane narrow identically to the live graph (ADR D4).

- [x] `P01.S01` - Widen GET /graph/asof to accept and apply the canonical Filter, replacing the hardcoded Filter::default(), with validation and the tiers envelope unchanged; `engine/crates/vaultspec-api/src/routes/temporal.rs`.
- [x] `P01.S02` - Audit the GET /events consumers and, if any corpus-projecting view renders the event lane, widen EventsParams to accept the canonical Filter facets alongside from/to/kinds/bucket, otherwise record /events as a non-corpus projection exempt from the filter; `engine/crates/vaultspec-api/src/routes/temporal.rs`.
- [x] `P01.S03` - Add engine tests proving a filtered as-of snapshot (and the event lane, if widened) narrows by every facet and stays bounded and self-consistent; `engine/crates/engine-query`.

### Phase `P02` - Timeline consumes the canonical filter

The timeline narrows its lineage by dashboardState.filters, folding the filter into query identity but never the viewport, revising the prior date-only boundary (ADR D3).

- [x] `P02.S04` - Pass dashboardState.filters (and the active as-of) to the timeline lineage read so the timeline narrows by the canonical filter; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `P02.S05` - Fold the filter and as-of into the lineage query identity but NOT the viewport, so a filter change is one new bounded query while scroll and zoom stay in-memory windowing with no refetch; `frontend/src/stores/server/queries.ts`.
- [x] `P02.S06` - Mirror the widened as-of and event-lane shapes in the mock engine double and assert a captured live sample narrows through the same client path the app uses; `frontend/src/stores/server`.
- [x] `P02.S07` - Add stores tests that a filter change re-queries the lineage once and a viewport nudge does not; `frontend/src/stores/server/queries.test.ts`.

### Phase `P03` - Promote the graph category toggle; retire the visibility mask

The graph legend's category dots write the canonical doc_types/kinds facet and the canvas-local hiddenCategories mask is retired, so category narrowing cross-wires to every view (ADR D2).

- [x] `P03.S08` - Rewire the CategoryLegend dots to write the canonical doc_types/kinds facet through toggleFilterFacet and reflect the canonical filter active state instead of the canvas-local mask; `frontend/src/app/stage/CategoryLegend.tsx`.
- [x] `P03.S09` - Retire the canvas-local visibility seam: remove graphCategoryVisibility.ts, the hiddenCategories view-store slice, and the scene compose step in dashboardFilterChoices.ts; `frontend/src/stores/view`.
- [x] `P03.S10` - Align the promoted category set with the index-node-exclusion outcome so the legend offers only displayable categories (index and code stay tokens, not displayable nodes) and coordinate with that in-flight plan before editing shared category files; `frontend/src/stores/server/liveAdapters.ts`.

### Phase `P04` - Intent guardrails and settings seeds

The structural guard fails any corpus view that bypasses the canonical filter, and the settings seeds are documented as such (ADR D5, D6).

- [x] `P04.S11` - Document label_filter and confidence_floor as canonical-filter seeds that initialize dashboardState.filters on scope load and are never a query-time bypass; `frontend/src/stores/server/dashboardState.ts`.
- [x] `P04.S12` - Extend the structural guard so a corpus-projecting surface that does not consume the canonical filter, or introduces a private filter or category-visibility mask, fails the gate; `frontend/src/app/filterConsolidation.guard.test.ts`.

### Phase `P05` - Verify and review

The full gate is green and bidirectional cross-wiring across rail, graph, and timeline is live-verified and reviewed (ADR D1).

- [x] `P05.S13` - Run the full lint gate just dev lint all plus cargo and frontend tests to exit 0; `engine`.
- [x] `P05.S14` - Live-verify bidirectional cross-wiring: set a feature filter and toggle a category from the rail AND from the graph legend, confirm rail, graph, and timeline narrow together, and confirm time-travel honours the active filter; `frontend/src/app`.
- [x] `P05.S15` - Run vaultspec-code-review for layer ownership, selector discipline, mock fidelity, and bounded queries, and resolve required revisions before close; `.vault/audit`.

## Description

Make one global filter drive every corpus-projecting surface bidirectionally,
executing the accepted `unified-filter-plane` ADR against the
`unified-filter-plane` research map. The filter STATE is already one canonical
plane (`dashboardState.filters`, the engine `Filter` grammar, one stores write
seam); this plan closes the CONSUMER and CONTROL gaps the research found - the
timeline consumes no filter today, the graph carries a canvas-local category
toggle that bypasses the canonical filter, and the temporal wire is uneven. The
phases move backend-out: even the temporal wire (P01), make the timeline a filter
consumer (P02), promote the graph category toggle onto the canonical facet and
retire the bypassing mask (P03), fence the intent law with a structural guard and
document the settings seeds (P04), then verify and review (P05).

Two in-flight plans are coordinated with, not collided into. This plan supersedes
only the timeline-date-only boundary of the accepted `filter-consolidation` ADR
(whose own plan is complete bar a final gate run); its other settled decisions
(left-rail-sole-author, timeline-sole-date-range-writer, Search-fence) are
preserved. P03.S10 aligns the promoted category set with the in-flight
`index-node-exclusion` plan, which keeps index and code as category tokens but not
as displayable graph nodes - the legend must offer only displayable categories.
The working tree is shared and dirty across sibling campaigns that also touch the
category legend, the view store, and the timeline; execution edits files in place,
never reverts another agent's uncommitted work, and commits by pathspec.

## Steps

## Parallelization

P01 (backend wire) and P03 (promote the graph category toggle) share no files and
may run in parallel. P02 (timeline consumes the filter) has a hard ordering after
P01: the timeline mock fidelity step (P02.S06) and the filtered as-of behaviour
depend on the widened `/graph/asof` and event-lane shapes landing first. P04
(guardrails) runs after P02 and P03 land, since the structural guard asserts the
consuming behaviour those phases introduce. P05 (verify and review) is last and
sequential. Within P03, S08 and S09 are tightly coupled (promoting the toggle and
retiring the mask are one cutover) and should land in a single coordinated change;
S10 must be reconciled against the `index-node-exclusion` plan before its shared
category files are edited.

## Verification

The plan is complete when every Step is closed and:

- `just dev lint all` plus the cargo and frontend test suites exit 0 (P05.S13),
  including the prettier and rustfmt steps - a partial gate is not green.
- Setting a feature filter or toggling a category from the LEFT RAIL narrows the
  rail tree, the graph, AND the timeline together (P05.S14).
- Toggling a category from the GRAPH LEGEND narrows the rail tree, the graph, AND
  the timeline together - the same cross-wiring in reverse (P05.S14).
- Time-travel (`/graph/asof`) renders the as-of snapshot narrowed by the active
  filter, not the full historical graph (P01.S01, P05.S14).
- A filter change re-queries the timeline lineage exactly once and a viewport
  scroll or zoom triggers no refetch (P02.S05, P02.S07).
- The extended structural guard fails the build if a corpus-projecting surface
  does not consume the canonical filter or introduces a private filter or
  category-visibility mask (P04.S12).
- `vaultspec-code-review` returns PASS with no open required revisions (P05.S15).
