---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Carry salience/embedding/derivation through sliceToScene and graphDeltaToScene

## Scope

- `frontend/src/scene/sceneMapping.ts`

## Description

## Outcome

`engineNodeToScene`/`engineEdgeToScene` now carry salience, embedding, and derivation; the delta mapper inherits it via the shared node/edge mappers.

## Notes
