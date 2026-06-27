---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S05'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---

# type status_value and status_class on the wire node and the stores mirror

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Add `status_value?: string` and `status_class?: string` to the wire-node type, placed beside `authority_class`/`aggregate`, documented to mirror the engine P01 additive projection.
- Note in the doc comments that both fields are optional, ride together, are absent on types with no per-type status machine, and never re-key the node.

## Outcome

The stores mirror now types the two additive status fields the engine serves on graph-query nodes, so every downstream consumer sees the same snake_case wire shape. No existing field changed; the change is purely additive.

## Notes

The fields stay strings on the wire (the closed-enum validation lives in the scene's pure status util, not the wire type), matching how `authority_class` is a bare string beside its closed vocabulary.
