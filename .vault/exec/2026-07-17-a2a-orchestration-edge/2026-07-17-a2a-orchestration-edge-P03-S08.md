---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S08'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Prove the relay live end to end including replay from since, gap emission on eviction and lag, and the oversized-frame drop sentinel passing through unaltered

## Scope

- `engine/crates/vaultspec-api/src/routes/`

## Description

- Add a live loopback test standing up a real (test-harness) upstream socket and a `BufReader`-driven pump into a real `RunRelay`, exercising the relay end to end rather than mocking the upstream — per the project's mock-free test-integrity mandate.
- Prove replay-from-`since` against the relay's ring, matching the since-replay contract shared by the engine's other SSE channels.
- Prove gap emission on ring eviction and consumer lag, so a lagging or reconnecting client observes an honest gap marker rather than silently missing frames.
- Prove the oversized-frame drop sentinel (the a2a `sse_frames` 256 KiB frame-cap signal) passes through the relay unaltered, confirming the relay's own `MAX_RELAY_FRAME_BYTES = 512 * 1024` safety net sits strictly above the upstream's own cap and never mangles the sentinel it is meant to pass through.

## Outcome

Landed at commit `fd7069cb01` alongside S07, tests colocated in `a2a_stream.rs` under `#[cfg(test)] mod tests`. `cargo test -p vaultspec-api routes::ops` — 63 passed, 0 failed (opus-edge's verification).

## Notes
