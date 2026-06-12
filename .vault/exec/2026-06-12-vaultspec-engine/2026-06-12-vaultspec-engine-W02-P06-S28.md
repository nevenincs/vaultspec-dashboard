---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S28'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement temporal event log persistence correlating events to node ids

## Scope

- `engine/crates/engine-store/src/events.rs`

## Description

- Implement event-log persistence: `EventRecord` (contract section 5 raw shape minus store-assigned seq), batch persist returning monotonic seqs, and path-to-node-id correlation (vault docs to document nodes, everything else to code-artifact nodes).
- Close review carry W01P01-002: corrupt `node_ids` rows now raise a typed `CorruptEventRow` error on every read path - never a silent empty vec - proven by a corruption test.

## Outcome

The timeline's join key (`node_ids`) is persisted and read loud; W02.P07 bucketing can build on this read path safely.

## Notes

None.
