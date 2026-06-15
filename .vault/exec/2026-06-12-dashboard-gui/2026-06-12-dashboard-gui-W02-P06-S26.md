---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S26'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement the node-scoped discover flow with visually quarantined, session-pinned-only semantic candidates per G3.c

## Scope

- `frontend/src/app/stage/Discover.tsx`

## Description

- Add `frontend/src/app/stage/Discover.tsx`: a discover affordance on the
  current selection running the engine's node-scoped discovery
  pass-through; candidates list with question-marked quarantine marks,
  scores, click-through selection, and per-candidate session pinning.
- Add session-pin state to the view store (`pinnedDiscoveries` with
  pin/unpin, deduplicated, tested): pinned candidates merge into the
  stage's slice and ride the semantic haze treatment; unpinned candidates
  never touch the graph. Nothing persists anywhere - suggestions are
  session-only by design.
- Degrade truthfully: when rag is down the discovery query fails and the
  panel states "semantic discovery offline" - never a dead control (the
  mock's `degrade()` exercises this path).

## Outcome

Probabilistic suggestions look like suggestions: quarantined in the panel,
haze-rendered when pinned, gone next session. Gates green: typecheck,
eslint, vitest (129 passed), prettier.

## Notes

A pinned candidate whose target is not materialized on stage is held as a
dangling edge (surfaced by the model, not drawn) until an expansion brings
the target in - acceptable until the discover flow optionally fetches the
candidate's node, noted as a refinement.

