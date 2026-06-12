---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S33'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement event bucketing with auto, raw and fixed-interval modes returning per-bucket counts by kind

## Scope

- `engine/crates/engine-query/src/events.rs`

## Description

- Implement event bucketing with raw, auto, and fixed-interval modes: raw passes contract-shaped events (stable id, ts, kind, ref, node_ids); bucketed returns per-bucket counts by kind over \[from, to); auto targets at most 100 buckets.
- Implement the wire grammar parser (raw|auto|30s|15m|1h|1d) with loud None on bogus values.

## Outcome

Engine-side downsampling per contract section 5: the timeline never renders ten thousand marks; the no-event-lost property is tested.

## Notes

Consumes the strict (loud-on-corrupt) event read path from W02.P06.S28 as the review required.
