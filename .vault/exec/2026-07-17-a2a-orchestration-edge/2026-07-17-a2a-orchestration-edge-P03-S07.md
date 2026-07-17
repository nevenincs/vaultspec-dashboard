---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S07'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Relay the a2a run stream as a new engine SSE channel feeding bounded versioned frames into the shared ring with seq and gap semantics and honest degradation to run-status polling

## Scope

- `engine/crates/vaultspec-api/src/routes/`

## Description

- Add `mod a2a_stream` under `routes/ops/` and register `GET /ops/a2a/runs/{run_id}/stream` in `build_router` and `CONTRACT_ROUTES`, choosing a per-run SSE endpoint (one relay per `run_id`) rather than a single multiplexed `/stream` channel — a design decision that keeps subscriber fan-out and lifecycle scoped to the run it serves, matching the shape of the existing engine SSE channels.
- Add a bounded, process-global relay registry (`RELAYS: OnceLock<Mutex<HashMap<String, Arc<RunRelay>>>>`) capped at `MAX_CONCURRENT_RELAYS = 64`, pruning finished/unsubscribed runs, rather than an `AppState` field — keeps the relay set bounded independent of request-scoped state.
- Pump the upstream a2a run-stream over a blocking `BufReader`, bounded by `UPSTREAM_IDLE_TIMEOUT = 90s` per read, `MAX_RELAY_FRAME_BYTES = 512 * 1024` (512 KiB) per frame as a safety net above the upstream's own 256 KiB cap, and `RELAY_MAX_LIFETIME = 6 * 3600s` (6 hours) for the relay's total lifetime — every accumulator and subprocess-adjacent read carries an explicit bound, per the resource-bounds rule.
- Feed relayed frames into the shared ring (`RELAY_RING_CAP = 1024`, `RELAY_BROADCAST_CAP = 256`) with seq and gap semantics identical to the engine's other SSE channels, and degrade honestly to run-status polling (`STATUS_POLL_INTERVAL = 5s`, `STATUS_POLL_BUDGET = 10s`) when the upstream relay cannot be established.

## Outcome

Landed at commit `fd7069cb01` alongside S08 (the `a2a_stream.rs` module, 1029 lines, and its route wiring in `routes/ops/mod.rs` and `lib.rs`). `cargo test -p vaultspec-api routes::ops` — 63 passed, 0 failed (opus-edge's verification, re-confirmed compiling clean by ops before commit).

## Notes
