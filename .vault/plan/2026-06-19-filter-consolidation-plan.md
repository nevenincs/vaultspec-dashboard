---
tags:
  - '#plan'
  - '#filter-consolidation'
date: '2026-06-19'
modified: '2026-06-25'
tier: L2
related:
  - '[[2026-06-19-filter-consolidation-adr]]'
  - '[[2026-06-19-filter-consolidation-research]]'
---

# `filter-consolidation` plan

### Phase `P01` - audit every filtering edge across surfaces

Enumerate, with file-level precision, every filter affordance and its state-write path across the four surfaces, so coercion is targeted and nothing is missed.

Centralize all filtering onto one canonical surface (the left rail), make the graph, timeline, and right rail pure consumers, and codify the law.

- [x] `P01.S01` - audit the left rail filter surface and its state-write path; `frontend/src/app/left/RailFilter.tsx`.
- [x] `P01.S02` - audit the graph stage toolbar filter affordances; `frontend/src/app/stage/FilterBar.tsx`.
- [x] `P01.S03` - audit the timeline controls for any facet-filter affordance; `frontend/src/app/timeline/TimelineControls.tsx`.
- [x] `P01.S04` - audit the right activity rail for any facet-filter affordance; `frontend/src/app/right/`.

### Phase `P02` - migrate the filter UI into the left rail in Figma (binding)

Design the canonical filter (search field plus advanced facet flyout) into the binding left-rail node and update the node bindings, since Figma is the binding source of truth and code mirrors it.

- [x] `P02.S05` - design the canonical filter (search field plus advanced facet flyout) into the binding left-rail node in Figma; `frontend/figma/`.
- [x] `P02.S06` - update the node bindings for the relocated filter; `frontend/figma/component-map.json`.

### Phase `P03` - coerce code: rail gains the canonical filter, graph retires

Host the canonical filter in the left rail, then retire all filtering from the graph toolbar, so filtering relocates without ever being absent.

- [x] `P03.S07` - host the centralized FilterMenu/FilterSidebar trigger in the left rail filter area; `frontend/src/app/left/`.
- [x] `P03.S08` - wire the rail filter trigger to the existing shared facet intent hooks; `frontend/src/stores/server/dashboardFilterSidebarIntent.ts`.
- [x] `P03.S09` - retire the search box and Filter trigger from the graph toolbar; `frontend/src/app/stage/FilterBar.tsx`.
- [x] `P03.S10` - drop the EDITED date-range control from the advanced filter so the timeline is the sole date-range writer; `frontend/src/app/stage/FilterSidebar.tsx`.

### Phase `P04` - fence consumers (timeline, right rail) against regression

Confirm the timeline and right rail host no facet filtering and add guard tests so a future surface-local filter control fails the gate.

- [x] `P04.S11` - add a guard test asserting the graph toolbar hosts no filter control; `frontend/src/app/stage/`.
- [x] `P04.S12` - add a guard test asserting the timeline hosts no facet filter; `frontend/src/app/timeline/`.
- [x] `P04.S13` - add a guard test asserting the right rail hosts no facet filter; `frontend/src/app/right/`.

### Phase `P05` - gate green and codify the law

Run the full lint gate and tests to green, then codify the single-filter-surface rule.

- [x] `P05.S14` - run the full frontend lint gate and test suite to green; `frontend/`.
- [x] `P05.S15` - codify the rule filtering-has-one-canonical-surface; `.vaultspec/rules/rules/`.

## Description

Executes the `filter-consolidation` ADR: there is exactly ONE canonical location
for filtering controls (the left rail's filter area), writing the one shared
`dashboardState.filters`; the graph stage, the timeline, and the right activity
rail are pure consumers that host no filter controls. The state plane is already
centralized, so this is a UX-surface relocation, an audit of every filtering
edge, coercion onto the one surface, and codification of the rule. Figma is the
binding source of truth, so the filter UI is migrated into the left-rail design
(the binding `LeftRail` node) before code mirrors it; the graph toolbar only
retires its filter affordances AFTER the rail hosts the canonical filter, so
filtering is never absent. The timeline (already free of facet filtering, the
sole date-range writer) and the right rail (semantic Search pillar only, a
distinct concept) are audited and fenced against regression. Grounded in the ADR
and the rag-driven research in `related:`.

## Steps

## Parallelization

Phase P01 (audit) is independent and runs first; its four Steps parallelize.
Phase P02 (Figma migration) gates Phase P03 (code coercion) because Figma is
binding and code mirrors it. Within P03 the rail MUST gain the filter
(P03.S07/S08) before the graph retires it (P03.S09), so filtering is never
absent; the EDITED drop (P03.S10) is independent. Phase P04 (fence consumers)
parallelizes internally and can begin once P03 lands. Phase P05 (gate + codify)
is last; codify runs only after the gate is green.

## Verification

- The full lint gate is green: `just dev lint frontend` exits 0 (eslint +
  prettier + tsc), and the frontend test suite passes.
- The left rail's filter area renders the search field plus the advanced facet
  flyout (KIND/TOPIC/STATUS/HEALTH) and writes `dashboardState.filters`;
  live-verified against the running app, matching the binding Figma rail design.
- The graph stage toolbar hosts NO filter control (no search box, no Filter
  trigger); a guard test asserts this and fails if either reappears.
- The timeline hosts no facet filter (only the date-range Setter, lane toggle,
  zoom/fit) and the right rail hosts no facet filter (semantic Search pillar
  only); guard tests assert both.
- The advanced filter no longer authors the date range (timeline is the sole
  writer); it may render the active range as a read-back/clearable chip only.
- The rule `filtering-has-one-canonical-surface` is codified under
  `.vaultspec/rules/rules/`.
