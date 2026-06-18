---
tags:
  - '#exec'
  - '#document-edit-hardening'
date: '2026-06-18'
modified: '2026-06-18'
step_id: 'S03'
related:
  - "[[2026-06-18-document-edit-hardening-plan]]"
---




# Live-verify a brokered set-body write succeeds against the pinned core and a missing-verb core degrades with a tiered advisory not an exit-2 passthrough

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Confirm the running engine binary was rebuilt (18:45:20) after the W01.S01 commit `0320c9d` (18:42:32) by the dev supervisor, so the live engine includes the project-pinned core-resolution fix.
- Verify via `/status` that the engine now reports `core.invocation` as `uv run --no-sync vaultspec-core` (the project-pinned core) instead of the prior bare `vaultspec-core` (the stale global).
- Drive a live `POST /ops/core/set-body/write` against the real scratch vault document through the project-pinned core and confirm `status:"updated"` with a new blob and empty `checks`.
- Confirm the disk file reflects the new body and the watcher re-ingested (index generation advanced 37 to 46).

## Outcome

W01 is live-proven against a real vault document: the engine resolves and brokers the project-pinned core, a write succeeds through it end to end, and the change re-ingests. The prior live failure mode (engine silently brokering the stale global 0.1.31 that lacks the edit verbs, finding F1) is closed both in code and live. Requirement (1) of the mandate (pin/verify the project core so the engine can never silently break on a stale global) is satisfied and observable on the wire.

## Notes

- The fix reached the running engine through the dev supervisor's normal rebuild-and-restart on engine source change (a graceful, routine operation), not a manual disruptive restart. The engine token rotated on restart, as expected.
- The unambiguous proof is `/status` `core.invocation` now naming the uv-run path (only the S01 code change produces that); a successful write alone is ambiguous while the global stopgap is also at 0.1.32.
