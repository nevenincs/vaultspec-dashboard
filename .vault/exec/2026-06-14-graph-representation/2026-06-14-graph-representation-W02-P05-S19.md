---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:fcd653eb9a65ab6228dd66fbc260f0caacadf172f4579cfcc46d4a7187791b5a'
step_id: 'S19'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Render dangling lineage stubs honestly for incomplete derivation chains

## Scope

- `frontend/src/scene/field/lineageLayout.ts`

## Description

## Outcome

Dangling lineage stubs are rendered honestly: a node whose derivation parent is absent from the slice is flagged `dangling` and placed by its implied axis depth, never with a fabricated edge; off-spine nodes go to a holding lane.

## Notes
