---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S11'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Freeze and document the preserved stores hooks as the rewrite-consumable contract API surface

## Scope

- `frontend/src/stores/`

## Description

- Author the figma-parity-reconciliation contract reference enumerating the preserved stores-layer surface the view rewrite consumes unchanged.
- Document the wire-client and envelope primitives (the shared client, the thrown wire error carrying tiers, the single tiers reader, the named-subset availability deriver, the canonical tier ordering) plus the frozen wire shape types.
- Document the read hooks by domain (workspace/worktree, trees, graph, node detail and evidence, status and history, temporal, pipeline, session and settings, search) and the interpreted-view siblings that turn degradation into the dumb-view shape.
- Document the view stores as the intent surface the rewrite emits back, and the hard boundary the rewrite must not cross (no direct fetch, no raw tiers read, no per-view wire shape, no query key outside the registry).

## Outcome

The stores hooks contract is frozen as documentation only; no stores signature or shape was modified. The reference is the rewrite-consumable API surface for the chrome rewrite waves. No data SHAPE was touched, honoring the preserved-contract hard boundary.

## Notes

This Step is documentation, not code. The mock-vs-live divergence, layer-ownership, and tiers-honesty rules are recorded in the reference so the downstream view rewrite inherits them.
