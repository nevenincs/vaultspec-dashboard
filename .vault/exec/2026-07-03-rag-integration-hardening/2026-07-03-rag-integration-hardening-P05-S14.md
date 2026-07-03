---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S14'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# Run reprobe_rag_until_running under rag_offload so the bounded reprobe loop never pins a Tokio async worker

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Changed `reprobe_rag_until_running` signature to accept `state: &AppState` and `vault: &FsPath`, returning `Result<RagMachineState, (StatusCode, Json<Value>)>` to thread `rag_offload` errors up to the route handler.
- Inside the loop, wrapped each `probe_machine_state` call in `rag_offload(state, ...)` so all blocking std::net I/O runs on the Tokio blocking pool rather than pinning an async worker; inter-probe `tokio::time::sleep` gaps remain async.
- Updated the function doc comment to record the T1-R2/ADR-D5 constraint: each probe is spawn_blocking to prevent ≈7.5s worst-case occupancy of a Tokio worker thread.
- Updated the single call site in `start_rag_service` to pass `state` and `&cell.root.join(".vault")` and to propagate the `?` error.
- Fixed a `clippy::needless_borrow` lint at the call site (`&state` → `state`) before the final gate run.

## Outcome

`cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test -p vaultspec-api` all exit 0. Behavior is identical to the previous implementation — only the thread on which the probe I/O executes changes.

## Notes

No new tests were warranted: `reprobe_rag_until_running` is integration I/O with no pure-function surface to pin. The gate/post probe pattern in `start_rag_service` (already under `rag_offload`) serves as the precedent and implicit coverage.
