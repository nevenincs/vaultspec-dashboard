---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S43'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the graph verb exporting tier-labelled node-link JSON with filter and as-of flags

## Scope

- `engine/crates/vaultspec-cli/src/cmd/graph.rs`

## Description

- Implement the graph verb: filter parsed as the engine-owned JSON object (typed validation errors), present view via the cold index pipeline, `--as-of` via blob-true reconstruction at a ref; node-link JSON with the normalized filter echoed.

## Outcome

Live-verified: the broken lens (`--filter {"structural_state": ["broken"]}`) returned 74 broken structural edges on this repository - real signal.

## Notes

None.
