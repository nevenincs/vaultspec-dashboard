---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S07'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Add the stop and restart CLI verbs (discovery-driven shutdown call with pid-signal fallback, idempotent when nothing runs) and grow the status verb with a seat block reporting running state, pid, port, registered workspaces, and uptime

## Scope

- `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`

## Description

- Create `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`: `read_seat` (tolerant machine discovery parse), the running-predicate (fresh heartbeat + live ungated health), `stop` (bearer POST `/shutdown` via the reused bounded `LoopbackTransport`, platform-kill fallback as a bounded + output-capped subprocess, idempotent when nothing runs), `restart` (stop, then detached relaunch in the cwd workspace or launcher last-active), `spawn_detached_serve` (Windows `DETACHED_PROCESS|CREATE_NO_WINDOW`, null stdio), `wait_for_seat`.
- Short-circuit `Stop`/`Restart` in `main` before scope resolution (machine verbs need no workspace) with honest not-applicable tiers.
- `status` gains a `seat` block: running/pid/port/uptime + launcher-known workspaces.

## Outcome

stop/restart/status-seat verbs live and envelope-conformant; CLI suite passes in a scratch target dir (the shared target's binary was locked by the live dev session).

## Notes

A live Vite dev session (engine on 8767) kept respawning and locking `vaultspec.exe`; CLI tests verified against a scratch CARGO_TARGET_DIR rather than killing the user's session.
