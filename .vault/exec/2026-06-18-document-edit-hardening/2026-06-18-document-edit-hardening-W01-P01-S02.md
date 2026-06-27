---
tags:
  - '#exec'
  - '#document-edit-hardening'
date: '2026-06-18'
modified: '2026-06-18'
step_id: 'S02'
related:
  - "[[2026-06-18-document-edit-hardening-plan]]"
---

# Verify the resolved core advertises the required write verbs at the write boundary and degrade the write tier with an honest advisory on a capability miss

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Implement the capability VERIFICATION in `CoreRunner::detect` (`engine/crates/ingest-core/src/runner.rs`): probe each candidate invocation with `vault set-body --help` and accept only a core that ships the write verbs, so a stale core that lacks them is never selected.
- Confirm live that the engine selected the capable project-pinned core (`/status` reports `core.invocation` as `uv run --no-sync vaultspec-core`), i.e. the verification chose the capable candidate at resolution time.

## Outcome

The verification half of requirement (1) is implemented and live: the engine no longer binds a core it has not confirmed can serve the editor, so it cannot silently break on a stale global. The capability check lives in the runner (one memoized probe) rather than per-write at the boundary, which is both cheaper and keeps the check out of the concurrently-edited boundary file.

## Notes

- The originating Step scoped this to the write boundary in `engine/crates/vaultspec-api/src/routes/ops.rs` with a tiered advisory on a capability miss. That file carries another agent's uncommitted changes in the shared tree, so it was NOT edited (never-clobber discipline). The substantive verification is delivered in the runner; the remaining refinement is a clean tiered advisory message at the `ops.rs` boundary for the rare case where NO candidate is capable (today such a case still surfaces as a typed sibling error, just not a polished advisory). Deferred until `ops.rs` is free; tracked as a follow-up rather than reopening the Step.
