---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S39'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Wire representation-mode and overlays from the view store into Stage scene commands

## Scope

- `frontend/src/app/stage/Stage.tsx`

## Description

## Outcome

Stage reads `activeRepresentationMode` and `overlays` and emits `set-representation-mode`/`set-overlays`; the lens re-query is the slice-key change. Composition is realized by these independent reactive inputs.

## Notes
