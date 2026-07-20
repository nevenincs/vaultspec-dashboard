---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S19'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Enforce pre-allocation HTTP and SSE byte ceilings, byte-budget replay storage, and restartable relay lifecycle with adversarial socket and churn coverage

## Scope

- `engine/crates/vaultspec-api/src/routes/ops/a2a_stream.rs`

## Description

- Reject oversized status lines, header lines, aggregate heads, chunk declarations, and chunks before proportional allocation.
- Bound incremental SSE accumulation, drain oversized frames to the next delimiter, and cap dense per-push output with an explicit drop signal.
- Store one serialized immutable frame behind shared ownership and enforce 4 MiB replay, 8 MiB per-relay, and 64 MiB global retained-byte ceilings.
- Materialize replay lazily and retain count caps as defense in depth.
- Track producer ownership explicitly, remove every unsubscribed producerless tombstone, and restart a producer when a reconnect wins the exit race.
- Remove engine-side degraded status polling so the browser remains the sole authoritative poll owner.
- Record the latest missing sequence, require contiguous snapshot recovery, and preserve terminal state even when control-frame reservation fails.
- Treat clean pre-terminal EOF as transport loss while allowing EOF after a terminal frame to complete without reconnect churn.
- Split relay tests into a submodule so every source file remains below the 1,500-line gate.

## Outcome

Relay memory and parser behavior are bounded before allocation, reservation pressure leaves explicit missing-sequence evidence, terminal state remains recoverable, and clean EOF has lifecycle-aware reconnect behavior. The focused Rust A2A route suite passed 42 tests; the focused frontend stream/recovery suite passed 50 tests after the terminal-EOF follow-up. Module-size, formatting, and diff checks passed.

## Notes

The first hardening pass still allowed one 512 KiB chunk containing many tiny frames to allocate tens of thousands of parsed objects before delivery. The adversarial follow-up caps each push at 256 outputs, reserves the final slot for `progress_dropped`, drains overflow without parsing it, and proves framing recovers on the next push.
