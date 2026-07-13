---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-07-12'
step_id: 'S44'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# build the search tab over the search pass-through with typed filter chips and node-id click-through to the stage

## Scope

- `frontend/src/app/right/SearchTab.tsx`

## Description

- Add `frontend/src/app/right/SearchTab.tsx`: the pillar-3 search surface
  as a rail tab - query input over the engine's search pass-through, the
  vault/code target as typed chips, results listed with score, source,
  and excerpt.
- Each result clicks through into the graph via the engine's node-id
  annotation (contract §8) - the shared selection focuses the stage;
  results without a node id render unclickable rather than dead.
- The activity rail gained its tab strip (activity | search) per the
  ADR's rail-tab-plus-palette reachability.

## Outcome

Search reaches the graph in one click. Gates green: typecheck, eslint,
vitest (188 passed), prettier.

## Notes

The rag-down fallback and the explicit semantic-search-offline state are
S45's; this step renders the healthy path with a generic failure line
pointing at the rag card until then.
