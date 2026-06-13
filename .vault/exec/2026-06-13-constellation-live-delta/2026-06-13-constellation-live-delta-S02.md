---
tags:
  - '#exec'
  - '#constellation-live-delta'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S02'
related:
  - "[[2026-06-13-constellation-live-delta-plan]]"
---

# Project the rebuild diff to feature-granularity meta-edge and feature-node deltas on the shared seq clock

## Scope

- `engine/crates/engine-query/src/graph.rs`

## Description

- Add `feature_delta(old, new, scope, t, seq_start) -> (Vec<Value>, last_seq)`:
  project both graphs to the feature granularity (feature-convergence nodes +
  meta-edges) and diff them by stable id into `granularity: "feature"` entries
  of the same wire shape as the document deltas, advancing `seq` from
  `seq_start`.
- Delegate node synthesis to `feature_nodes`, so the projection inherits the
  convergence policy (incl. the single-member floor when the peer's LENS F fix
  lands).

## Outcome

The engine owns the constellation delta projection (contract section 4: the GUI
never flattens document edges). Unit-tested: a new cross-feature meta-edge
appears as a `feature`-tagged `add`, seqs are contiguous from `seq_start`, and
`last_seq` is reported for splicing.

## Notes

Meta-edge identity is the endpoint pair (`src`/`dst` feature node ids), stable
across re-derivation (provenance-stable keys), so the diff is deterministic.
