---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Stop mapping an already-running server start to 502 in the lifecycle runner and attach on exit-1 or exit-0

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Add `run_rag_lifecycle_capture`: spawn `server start`/`stop` with the same bounded-read + timeout + kill lifecycle as the shared runner but WITHOUT appending `--json` and WITHOUT auto-mapping a non-zero exit to 502 - it returns the raw `LifecycleRun { code, stdout }` so the handler decides the outcome.
- In `start_rag_service`, after spawning `server start`, RE-DISCOVER via `probe_machine_state`: a now-Running service is success (`started` on exit 0, `machine_owned` on a lost race / exit 1) and `attached: true`; only a re-probe that still finds no running service is a `status:"failed"` envelope carrying the exit code + captured output + degraded tier. An already-running `server start` (exit 1) therefore attaches, never 502s.

## Outcome

Done. The lifecycle path no longer maps an already-running `server start` to 502 and no longer discards its output. `cargo build -p vaultspec-api` is green. Together with S05's gate, a start attempt that fails because a service is already running is treated as success (attached).

## Notes

Surfaced and fixed a latent breakage: the shared runner appended `--json` unconditionally, but rag 0.2.25's `server start` AND `server stop` have no `--json` flag (verified via `--help`), so the prior invocation would have exit-2'd on the new baseline. The dedicated capture runner omits `--json`; status/doctor/install keep it on the shared JSON runner.
