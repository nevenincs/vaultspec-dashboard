---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:708005ce4e994cd425031d59f67b38e5faa27131b8cf9f1cbf403f615b1678cc'
step_id: 'S34'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Handle set-representation-mode in field assembly re-laying out with id-keyed object constancy

## Scope

- `frontend/src/scene/field/fieldAssembly.ts`

## Description

## Outcome

`fieldAssembly.applyRepresentationMode` re-lays-out via the dispatcher: deterministic modes seed explicit id-keyed positions and stop FA2; connectivity feeds ONLY the declared+structural backbone to FA2 and warm-starts (object constancy). A held gated mode downgrades and echoes the applied mode honestly.

## Notes
