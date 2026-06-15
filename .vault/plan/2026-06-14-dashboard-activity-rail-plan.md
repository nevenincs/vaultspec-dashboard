---
tags:
  - '#plan'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-06-15'
tier: L2
related:
  - '[[2026-06-14-dashboard-activity-rail-adr]]'
  - '[[2026-06-14-dashboard-activity-rail-research]]'
---








# `dashboard-activity-rail` plan

Refactor the right rail from three tabs to the four-tab review-rail IA and add the `work` tab as a designed frame; the pipeline content is a separate plan.

### Phase `P01` - rail tab-strip refactor to four tabs

Refactor the right-rail tab strip from three tabs to the four-tab review-rail information architecture (now / work / changes / search), inserting the work tab in second position while preserving the existing tablist affordance and the unchanged membership of now, changes, and search.



- [x] `P01.S01` - Add the work tab entry to the RAIL_TABS array in second position so the order reads now, work, changes, search; `frontend/src/app/AppShell.tsx`.
- [x] `P01.S02` - Extend the ActivityRail tab state union type to include the work tab id alongside activity, changes, and search; `frontend/src/app/AppShell.tsx`.
- [x] `P01.S03` - Add the work tab branch to the tab-content dispatch in ActivityRail rendering the WorkTab frame component; `frontend/src/app/AppShell.tsx`.
- [x] `P01.S04` - Verify the now tab keeps NowStrip, OpsPanel, and Inspector, the changes tab keeps ChangesOverview, and the search tab keeps SearchTab unchanged in membership; `frontend/src/app/AppShell.tsx`.

### Phase `P02` - work tab frame with designed degraded and empty state

Add the WorkTab frame component that renders the work pillar's own designed degraded and empty state, reading availability through a stores selector and never fetching the engine or reading the raw tiers block; the real pipeline content is delivered by the separate dashboard-pipeline-status plan and is out of scope here.

- [x] `P02.S05` - Create the WorkTab frame component as a new app-chrome surface in the right rail directory; `frontend/src/app/right/WorkTab.tsx`.
- [x] `P02.S06` - Read work-pillar availability in WorkTab through a stores selector hook only, never calling fetch and never reading the raw tiers block, per dashboard-layer-ownership; `frontend/src/app/right/WorkTab.tsx`.
- [x] `P02.S07` - Render a designed degraded state in WorkTab gated on the stores tiers truth, never inferred from a bare transport error, per degradation-is-read-from-tiers-not-guessed-from-errors; `frontend/src/app/right/WorkTab.tsx`.
- [x] `P02.S08` - Render a designed empty state in WorkTab for the available-but-no-work case stating no in-flight pipeline work in the current scope; `frontend/src/app/right/WorkTab.tsx`.
- [x] `P02.S09` - Style WorkTab using only inherited design-language tokens and the two sanctioned icon families with no new token, icon, or motion grammar; `frontend/src/app/right/WorkTab.tsx`.
- [x] `P02.S10` - Make the WorkTab degraded and empty states grayscale-safe so meaning is carried by shape and text first, not color alone; `frontend/src/app/right/WorkTab.tsx`.

### Phase `P03` - wire the work tab into AppShell and conform a11y

Wire WorkTab into the AppShell rail content dispatch under the work tab id and confirm the four-tab strip preserves role=tablist, aria-selected, and keyboard tab order across all four tabs.

- [x] `P03.S11` - Import WorkTab into AppShell and render it in the work tab content branch; `frontend/src/app/AppShell.tsx`.
- [x] `P03.S12` - Confirm the work tab button carries role=tab and aria-selected reflecting the active tab like the other three tabs; `frontend/src/app/AppShell.tsx`.
- [x] `P03.S13` - Confirm the four-tab strip preserves keyboard tab order with the work tab reachable second in sequence; `frontend/src/app/AppShell.tsx`.
- [x] `P03.S14` - Confirm the role=tablist container keeps its aria-label and the four tabs render contiguously inside it; `frontend/src/app/AppShell.tsx`.

### Phase `P04` - tests and final green gate

Extend rail tests for the four-tab strip and the WorkTab frame, add a WorkTab render test, and run the full frontend lint gate plus vitest to a clean green before review.

- [x] `P04.S15` - Extend the rail unit tests to assert the RAIL_TABS strip is exactly now, work, changes, search in that order; `frontend/src/app/right/rail.test.ts`.
- [x] `P04.S16` - Add a WorkTab render test asserting the degraded state renders when the stores selector reports the work pillar unavailable; `frontend/src/app/right/WorkTab.render.test.tsx`.
- [x] `P04.S17` - Add a WorkTab render test asserting the empty state renders when the work pillar is available with no in-flight work; `frontend/src/app/right/WorkTab.render.test.tsx`.
- [x] `P04.S18` - Add a WorkTab render test asserting the degraded state derives from the tiers truth and not from a bare transport error; `frontend/src/app/right/WorkTab.render.test.tsx`.
- [x] `P04.S19` - Run just dev lint frontend and confirm exit 0 including eslint, prettier format:check, and tsc; `frontend/`.
- [x] `P04.S20` - Run the frontend vitest suite and confirm the rail and WorkTab tests pass green; `frontend/`.

## Description

This plan delivers ONLY the right-rail information architecture pinned by the `dashboard-activity-rail` ADR: the rail is re-stated as the four-tab review rail, and the missing `work` pillar lands as a first-class tab. Today the rail in `AppShell.tsx` carries three tabs (`now`, `changes`, `search`) via the `RAIL_TABS` array (the `now` tab's internal id is `activity`) and a tab-content dispatch inside `ActivityRail()`. This plan refactors that strip to four tabs in the order `now`, `work`, `changes`, `search`, inserting `work` in second position between the liveness pillar and the evidence pillar, and adds a new `WorkTab.tsx` frame component in `frontend/src/app/right/`.

Scope is deliberately narrow. The `work` tab ships as a FRAME only: it renders its own designed degraded state and a designed empty state, but it does NOT build the real pipeline content (the active-ADR/plan list, the progress rings, or the wave/phase/step tree). That content is specified by the sibling `dashboard-pipeline-status` ADR and is delivered by a SEPARATE plan; this plan must not implement it. The `now`, `changes`, and `search` tabs are unchanged in membership: `now` keeps `NowStrip`, `OpsPanel`, and the selection-driven `Inspector`; `changes` keeps `ChangesOverview`; `search` keeps `SearchTab`.

The work is bound by the established layer-ownership boundaries. `WorkTab` is app chrome under `dashboard-layer-ownership`: it reads stores selector hooks only, never calls `fetch` against the engine, and never reads the raw `tiers` block. Per `degradation-is-read-from-tiers-not-guessed-from-errors`, its degraded state is gated on the per-tier availability the stores layer interprets from the `tiers` block, never inferred from a bare transport error or timeout. It introduces no new design token, no third icon family, and no new motion grammar (inherited base design-language, iconography, and motion ADRs are fixed), and its degraded and empty states are grayscale-safe so meaning is carried by shape and text first. The existing `role="tablist"` / `aria-selected` / keyboard tab-order affordance in `AppShell.tsx` is preserved across all four tabs. Grounding is the `dashboard-activity-rail` ADR (the decision) and the `dashboard-activity-rail` research (the converged two-pillar idiom and the layer-ownership map), both linked in `related:`.

## Steps







## Parallelization

The four phases carry hard ordering and are not parallel. P01 (the tab-strip refactor) and P02 (the WorkTab frame) both produce code P03 wires together, so P03 depends on both; the cleanest path is P02 first (so the component exists to import), then P01 can reference it. In practice P01 and P02 may proceed concurrently by a single executor since they touch different files (`AppShell.tsx` versus `WorkTab.tsx`), but P03 (wiring plus a11y conformance) must follow both, and P04 (tests plus the green gate) must be last because it asserts the finished behaviour. Within P01 the steps are sequential against one file. Within P02 the steps build one component and are sequential. Within P04, S15 through S18 author tests independently, but S19 (the lint gate) and S20 (vitest) are the final gate and run after every code and test step is complete.

## Verification

The plan is complete when every Step is closed (`- [x]`) and the following verifiable checks hold:

- The `RAIL_TABS` array in `AppShell.tsx` is exactly `now`, `work`, `changes`, `search` in that order, asserted by the extended `rail.test.ts` unit test.
- The `now` tab still renders `NowStrip`, `OpsPanel`, and `Inspector`; `changes` still renders `ChangesOverview`; `search` still renders `SearchTab` (unchanged membership), confirmed by inspection of the tab-content dispatch.
- `WorkTab.tsx` exists, reads availability through a stores selector hook only, calls no `fetch`, and reads no raw `tiers` block (conforms to `dashboard-layer-ownership`).
- `WorkTab` renders a designed degraded state gated on the stores tiers truth (not on a bare transport error), and a designed empty state for the available-but-no-work case, both asserted by `WorkTab.render.test.tsx`.
- The degraded and empty states are grayscale-safe and introduce no new token, icon family, or motion grammar.
- The four-tab strip preserves `role="tablist"`, per-tab `role="tab"` with `aria-selected`, the tablist `aria-label`, and keyboard tab order with `work` reachable second.
- `just dev lint frontend` exits 0 (eslint + prettier `format:check` + tsc) and the frontend vitest suite passes green, including the rail and WorkTab tests.
- The code reviewer signs off via `vaultspec-code-review`.
