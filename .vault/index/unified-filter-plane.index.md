---
generated: true
tags:
  - '#index'
  - '#unified-filter-plane'
date: '2026-06-22'
modified: '2026-06-23'
related:
  - '[[2026-06-22-unified-filter-plane-P01-S01]]'
  - '[[2026-06-22-unified-filter-plane-P01-S02]]'
  - '[[2026-06-22-unified-filter-plane-P01-S03]]'
  - '[[2026-06-22-unified-filter-plane-P02-S04]]'
  - '[[2026-06-22-unified-filter-plane-P02-S05]]'
  - '[[2026-06-22-unified-filter-plane-P02-S06]]'
  - '[[2026-06-22-unified-filter-plane-P02-S07]]'
  - '[[2026-06-22-unified-filter-plane-P03-S08]]'
  - '[[2026-06-22-unified-filter-plane-P03-S09]]'
  - '[[2026-06-22-unified-filter-plane-P03-S10]]'
  - '[[2026-06-22-unified-filter-plane-P04-S11]]'
  - '[[2026-06-22-unified-filter-plane-P04-S12]]'
  - '[[2026-06-22-unified-filter-plane-P05-S13]]'
  - '[[2026-06-22-unified-filter-plane-P05-S14]]'
  - '[[2026-06-22-unified-filter-plane-P05-S15]]'
  - '[[2026-06-22-unified-filter-plane-adr]]'
  - '[[2026-06-22-unified-filter-plane-audit]]'
  - '[[2026-06-22-unified-filter-plane-plan]]'
  - '[[2026-06-22-unified-filter-plane-research]]'
---

# `unified-filter-plane` feature index

Auto-generated index of all documents tagged with `#unified-filter-plane`.

## Documents

### adr

- `2026-06-22-unified-filter-plane-adr` - `unified-filter-plane` adr: `unified filter plane` | (**status:** `accepted`)

### audit

- `2026-06-22-unified-filter-plane-audit` - `unified-filter-plane` audit: `unified filter plane review`

### exec

- `2026-06-22-unified-filter-plane-P01-S01` - Widen GET /graph/asof to accept and apply the canonical Filter, replacing the hardcoded Filter::default(), with validation and the tiers envelope unchanged
- `2026-06-22-unified-filter-plane-P01-S02` - Audit the GET /events consumers and, if any corpus-projecting view renders the event lane, widen EventsParams to accept the canonical Filter facets alongside from/to/kinds/bucket, otherwise record /events as a non-corpus projection exempt from the filter
- `2026-06-22-unified-filter-plane-P01-S03` - Add engine tests proving a filtered as-of snapshot (and the event lane, if widened) narrows by every facet and stays bounded and self-consistent
- `2026-06-22-unified-filter-plane-P02-S04` - Pass dashboardState.filters (and the active as-of) to the timeline lineage read so the timeline narrows by the canonical filter
- `2026-06-22-unified-filter-plane-P02-S05` - Fold the filter and as-of into the lineage query identity but NOT the viewport, so a filter change is one new bounded query while scroll and zoom stay in-memory windowing with no refetch
- `2026-06-22-unified-filter-plane-P02-S06` - Mirror the widened as-of and event-lane shapes in the mock engine double and assert a captured live sample narrows through the same client path the app uses
- `2026-06-22-unified-filter-plane-P02-S07` - Add stores tests that a filter change re-queries the lineage once and a viewport nudge does not
- `2026-06-22-unified-filter-plane-P03-S08` - Rewire the CategoryLegend dots to write the canonical doc_types/kinds facet through toggleFilterFacet and reflect the canonical filter active state instead of the canvas-local mask
- `2026-06-22-unified-filter-plane-P03-S09` - Retire the canvas-local visibility seam: remove graphCategoryVisibility.ts, the hiddenCategories view-store slice, and the scene compose step in dashboardFilterChoices.ts
- `2026-06-22-unified-filter-plane-P03-S10` - Align the promoted category set with the index-node-exclusion outcome so the legend offers only displayable categories (index and code stay tokens, not displayable nodes) and coordinate with that in-flight plan before editing shared category files
- `2026-06-22-unified-filter-plane-P04-S11` - Document label_filter and confidence_floor as canonical-filter seeds that initialize dashboardState.filters on scope load and are never a query-time bypass
- `2026-06-22-unified-filter-plane-P04-S12` - Extend the structural guard so a corpus-projecting surface that does not consume the canonical filter, or introduces a private filter or category-visibility mask, fails the gate
- `2026-06-22-unified-filter-plane-P05-S13` - Run the full lint gate just dev lint all plus cargo and frontend tests to exit 0
- `2026-06-22-unified-filter-plane-P05-S14` - Live-verify bidirectional cross-wiring: set a feature filter and toggle a category from the rail AND from the graph legend, confirm rail, graph, and timeline narrow together, and confirm time-travel honours the active filter
- `2026-06-22-unified-filter-plane-P05-S15` - Run vaultspec-code-review for layer ownership, selector discipline, mock fidelity, and bounded queries, and resolve required revisions before close

### plan

- `2026-06-22-unified-filter-plane-plan` - `unified-filter-plane` plan

### research

- `2026-06-22-unified-filter-plane-research` - `unified-filter-plane` research: `unified filter plane`
