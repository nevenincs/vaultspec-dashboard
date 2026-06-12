---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S32'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement ordered diff-log generation between two times with monotonic sequence numbers and last-seq reporting

## Scope

- `engine/crates/engine-graph/src/diff.rs`

## Description

- Implement ordered diff-log generation between two graph states: add/change/remove entries for nodes then edges in deterministic id order, monotonic sequence numbers from a caller-supplied clock position, last-seq reported for stream splicing.
- Entry shape matches contract section 5 ({op, node|edge, t, seq}) - the SAME shape the live graph SSE channel reuses (one delta clock, REDLINE-3).

## Outcome

Scrub mechanics granted: keyframe plus client-applied delta log; no-op diffs do not advance the clock.

## Notes

None.
