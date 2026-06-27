---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S18'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add the LineageArc wire type carrying stable id, src, dst, relation, derivation, tier, and confidence

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Add the `LineageArc` wire type carrying the stable edge id, src, dst, relation, optional `derivation`, tier, and confidence.
- Make `derivation` optional, present only when the node-semantics field ships (the engine emits no `derivation` until then, the ADR's one real dependency).
- Constrain `tier` to the four canonical tier names; `confidence` is a number (engine f32).

## Outcome

`LineageArc` is exported from `engine.ts`. The optional `derivation` is the graceful-fallback seam: the surface draws real structural/declared/temporal lineage from day one and gains the richer label when the field lands.

## Notes

Arc identity rides the engine stable edge id (provenance-stable-keys-are-identity-bearing); the client never re-mints it.
