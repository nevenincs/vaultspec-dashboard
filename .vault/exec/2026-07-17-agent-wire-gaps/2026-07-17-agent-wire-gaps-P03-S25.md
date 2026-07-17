---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S25'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Wire the GET /v1/mode route serving the active workspace scope's OperationModeRecord (mode, scope_id, setting actor, updated_at_ms) off the store's existing current_record resolution, matching the write path's default-record behavior

## Scope

- `engine/crates/vaultspec-api/src/authoring/http/mod.rs`
- `engine/crates/vaultspec-api/src/authoring/http/wire_gaps.rs`

## Description

- Added `get_operation_mode` in the new `wire_gaps.rs` module, reading
  `uow.modes().current_record(&scope_id)` — the SAME store resolution `POST /v1/mode`
  round-trips, including its default-record behavior when the scope was never
  explicitly set.
- The scope is derived backend-side from the active worktree via
  `scope_id_for_worktree(&state.active_workspace_root())`, the same helper the write
  path uses, so the two routes always agree on which scope's record they read/write —
  never a client-claimed scope.
- Changed the router registration from `.route("/v1/mode", post(set_operation_mode))`
  to `.route("/v1/mode", post(set_operation_mode).get(get_operation_mode))`, keeping
  both verbs on the one path.
- Serves `scope_id`, `mode`, `actor`, `policy_id`, `policy_version`, and
  `updated_at_ms` (the record's `created_at_ms`, since every mode-set writes a fresh
  record) through the shared `response::snapshot` tiers envelope.

## Outcome

The autonomy control can now read the active operation mode pre-proposal, straight
from the wire, instead of inferring it from an empty review queue.

## Notes

Landed together with S17 and S23 in one reviewed commit (`4063e2b150`). Route-level
live test coverage (default-record-on-fresh-store + write/read round-trip) landed
separately in S26 (commit `9f67b2af07`). Independently reran
`cargo test -p vaultspec-api --lib -- authoring::http::tests::group3::mode_read_serves_default_and_round_trips_the_write`
— 1/1 passed — and the full `vaultspec-api` lib suite — 823/823 passed. This record
was authored during a fill pass (bookkeeping only, no code changes by me); the plan
tick already landed at `f7bdf28278`.
