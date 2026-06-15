---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S51'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the status snapshot and the multiplexed SSE stream with channels, sequence numbers and since resume or gap signal

## Scope

- `engine/crates/vaultspec-api/src/routes/stream.rs`

## Description

- Implement the status snapshot (index state, generation, backend rollup, watcher resident, last-seq) and the multiplexed SSE stream: channel filtering, monotonic ids, since= resume replaying the bounded ring, explicit gap event when the requested position predates the buffer (client re-keyframes).

## Outcome

Contract sections 6-7: stream is delta, status is recovery; splice guarantee via last_seq/since.

## Notes

Ring capacity 4096 entries; keep-alive enabled on the SSE response.
