---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S12'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Add the crash-loop guard: the launcher never auto-relaunches a seat that died within the backoff window and instead reports the crash-log path, with friendly plain-language errors for every launcher failure

## Scope

- `engine/crates/vaultspec-cli/src/cmd/launch.rs`

## Description

- Add the crash-loop guard: `last-launch.json` under the app home records each cold spawn; a launch within the 60 s window whose seat is not alive refuses to respawn and points at the workspace crash log.
- Every launcher failure message is plain language with a concrete next step (run `vaultspec serve` in a terminal to watch the error).

## Outcome

The launcher never thrashes a crashing seat; failures are actionable.

## Notes

The guard is bookkeeping-only (one tiny file), reset naturally by the window elapsing.
