---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S44'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the node verb with context and tiers flags returning detail or full context assembly

## Scope

- `engine/crates/vaultspec-cli/src/cmd/node.rs`

## Description

- Implement the node verb: detail (node, degree projection, neighbors) by default; `--context` returns the full tier-labelled bundle plus evidence (with the resolved-target bridge); `--tiers` narrows the context's edge groups.

## Outcome

Live-verified: the engine plan document reports 162 structural edges via degree projection.

## Notes

None.
