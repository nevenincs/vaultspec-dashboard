---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S50'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the temporal endpoints: events, graph as-of and graph diff sharing the monotonic delta clock

## Scope

- `engine/crates/vaultspec-api/src/routes/temporal.rs`

## Description

- Implement the temporal endpoints: events with engine-side bucketing over live commit walks, graph/asof (blob-true snapshot with the fidelity-stating tier block and keyframe clock position), graph/diff (ordered delta log consuming positions on the SAME monotonic clock as the live stream, last-seq reported).

## Outcome

Contract section 5 served; one delta clock across historical diffs and liveness (REDLINE-3).

## Notes

None.
