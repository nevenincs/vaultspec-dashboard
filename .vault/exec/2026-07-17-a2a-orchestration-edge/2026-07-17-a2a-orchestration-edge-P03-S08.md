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

## Live re-probe (2026-07-17, main binary against a fresh S06 gateway)

Re-ran the relay end to end through main's shipped per-run endpoint `GET /ops/a2a/runs/{run_id}/stream` against a fresh a2a gateway (from a2a HEAD, serving the S06 stream verb) on the explicitly declared port 8811. An isolated main engine binary was booted on port 19393 with `VAULTSPEC_A2A_HOME` pointed at a probe `service.json` declaring port 8811, so discovery attaches to the real gateway.

Proven live over the wire:

- Frames over the wire: `POST /ops/a2a/run-start` forwards to the gateway and returns the v1 envelope verbatim (run_id + mock-planner/coder/reviewer assignments); `GET /ops/a2a/runs/{run_id}/stream` then delivers a real SSE frame — `event: thread_terminal`, `id: 0`, `data:{...,"replay":true,"seq":0,"status":"failed",...}` — with a relay keepalive comment line.
- Replay from the ring: on reconnect the terminal frame is re-served with `replay:true`, and main's relay assigns the SSE `id:` field for the `Last-Event-ID`/`since=` protocol.
- Terminal latch: reconnecting with `Last-Event-ID: 0` still re-delivers the terminal event, so a late subscriber always learns the run ended rather than hanging.
- Agent tier present-only-when-degraded: with a fresh gateway heartbeat the run-start `tiers` block carries no `agent` key (declared/semantic/structural/temporal only); it degrades honestly only on stale discovery.
- Zero fabricated frames: the relay forwarded exactly what the gateway emitted, nothing invented.

a2a-side constraint (executor-service's domain, not a relay defect): mock-autonomous runs resolve `provider_ready:false` at execution time even when the gateway reports `worker_connected:true`/`worker_ready:true`, so the run fails at `last_sequence:0` and emits no intermediate progress frames. The gap-on-lag, gap-on-eviction, and `progress_dropped` sentinel-unaltered behaviors therefore cannot be driven by a natural mock run and are proven instead by the module's hermetic tests, which exercise deterministic ring overflow that a live run cannot reliably reproduce.

Hermetic coverage re-confirmed green on the main binary: `cargo test -p vaultspec-api --lib a2a_stream` — 17 passed, 0 failed, including `snapshot_since_replays_after_and_gaps_on_eviction`, `snapshot_since_emits_a_gap_when_the_resume_point_was_evicted`, `lagged_live_item_becomes_a_gap_not_a_silent_drop`, `upstream_progress_dropped_sentinel_passes_through_unaltered`, `an_oversized_frame_becomes_an_engine_drop_sentinel`, and `live_socket_relay_streams_chunked_sse_into_the_ring_with_replay_and_sentinel`.

## Notes
