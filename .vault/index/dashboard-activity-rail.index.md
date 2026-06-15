---
generated: true
tags:
  - '#index'
  - '#dashboard-activity-rail'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - '[[2026-06-14-dashboard-activity-rail-P01-S01]]'
  - '[[2026-06-14-dashboard-activity-rail-P01-S02]]'
  - '[[2026-06-14-dashboard-activity-rail-P01-S03]]'
  - '[[2026-06-14-dashboard-activity-rail-P01-S04]]'
  - '[[2026-06-14-dashboard-activity-rail-P02-S05]]'
  - '[[2026-06-14-dashboard-activity-rail-P02-S06]]'
  - '[[2026-06-14-dashboard-activity-rail-P02-S07]]'
  - '[[2026-06-14-dashboard-activity-rail-P02-S08]]'
  - '[[2026-06-14-dashboard-activity-rail-P02-S09]]'
  - '[[2026-06-14-dashboard-activity-rail-P02-S10]]'
  - '[[2026-06-14-dashboard-activity-rail-P03-S11]]'
  - '[[2026-06-14-dashboard-activity-rail-P03-S12]]'
  - '[[2026-06-14-dashboard-activity-rail-P03-S13]]'
  - '[[2026-06-14-dashboard-activity-rail-P03-S14]]'
  - '[[2026-06-14-dashboard-activity-rail-P04-S15]]'
  - '[[2026-06-14-dashboard-activity-rail-P04-S16]]'
  - '[[2026-06-14-dashboard-activity-rail-P04-S17]]'
  - '[[2026-06-14-dashboard-activity-rail-P04-S18]]'
  - '[[2026-06-14-dashboard-activity-rail-P04-S19]]'
  - '[[2026-06-14-dashboard-activity-rail-P04-S20]]'
  - '[[2026-06-14-dashboard-activity-rail-adr]]'
  - '[[2026-06-14-dashboard-activity-rail-plan]]'
  - '[[2026-06-14-dashboard-activity-rail-research]]'
---

# `dashboard-activity-rail` feature index

Auto-generated index of all documents tagged with `#dashboard-activity-rail`.

## Documents

### adr

- `2026-06-14-dashboard-activity-rail-adr` - `dashboard-activity-rail` adr: `right activity rail information architecture` | (**status:** `accepted`)

### exec

- `2026-06-14-dashboard-activity-rail-P01-S01` - Add the work tab entry to the RAIL_TABS array in second position so the order reads now, work, changes, search
- `2026-06-14-dashboard-activity-rail-P01-S02` - Extend the ActivityRail tab state union type to include the work tab id alongside activity, changes, and search
- `2026-06-14-dashboard-activity-rail-P01-S03` - Add the work tab branch to the tab-content dispatch in ActivityRail rendering the WorkTab frame component
- `2026-06-14-dashboard-activity-rail-P01-S04` - Verify the now tab keeps NowStrip, OpsPanel, and Inspector, the changes tab keeps ChangesOverview, and the search tab keeps SearchTab unchanged in membership
- `2026-06-14-dashboard-activity-rail-P02-S05` - Create the WorkTab frame component as a new app-chrome surface in the right rail directory
- `2026-06-14-dashboard-activity-rail-P02-S06` - Read work-pillar availability in WorkTab through a stores selector hook only, never calling fetch and never reading the raw tiers block, per dashboard-layer-ownership
- `2026-06-14-dashboard-activity-rail-P02-S07` - Render a designed degraded state in WorkTab gated on the stores tiers truth, never inferred from a bare transport error, per degradation-is-read-from-tiers-not-guessed-from-errors
- `2026-06-14-dashboard-activity-rail-P02-S08` - Render a designed empty state in WorkTab for the available-but-no-work case stating no in-flight pipeline work in the current scope
- `2026-06-14-dashboard-activity-rail-P02-S09` - Style WorkTab using only inherited design-language tokens and the two sanctioned icon families with no new token, icon, or motion grammar
- `2026-06-14-dashboard-activity-rail-P02-S10` - Make the WorkTab degraded and empty states grayscale-safe so meaning is carried by shape and text first, not color alone
- `2026-06-14-dashboard-activity-rail-P03-S11` - Import WorkTab into AppShell and render it in the work tab content branch
- `2026-06-14-dashboard-activity-rail-P03-S12` - Confirm the work tab button carries role=tab and aria-selected reflecting the active tab like the other three tabs
- `2026-06-14-dashboard-activity-rail-P03-S13` - Confirm the four-tab strip preserves keyboard tab order with the work tab reachable second in sequence
- `2026-06-14-dashboard-activity-rail-P03-S14` - Confirm the role=tablist container keeps its aria-label and the four tabs render contiguously inside it
- `2026-06-14-dashboard-activity-rail-P04-S15` - Extend the rail unit tests to assert the RAIL_TABS strip is exactly now, work, changes, search in that order
- `2026-06-14-dashboard-activity-rail-P04-S16` - Add a WorkTab render test asserting the degraded state renders when the stores selector reports the work pillar unavailable
- `2026-06-14-dashboard-activity-rail-P04-S17` - Add a WorkTab render test asserting the empty state renders when the work pillar is available with no in-flight work
- `2026-06-14-dashboard-activity-rail-P04-S18` - Add a WorkTab render test asserting the degraded state derives from the tiers truth and not from a bare transport error
- `2026-06-14-dashboard-activity-rail-P04-S19` - Run just dev lint frontend and confirm exit 0 including eslint, prettier format:check, and tsc
- `2026-06-14-dashboard-activity-rail-P04-S20` - Run the frontend vitest suite and confirm the rail and WorkTab tests pass green

### plan

- `2026-06-14-dashboard-activity-rail-plan` - `dashboard-activity-rail` plan

### research

- `2026-06-14-dashboard-activity-rail-research` - `dashboard-activity-rail` research: `right-hand review rail: in-flight pipeline status and changes`
