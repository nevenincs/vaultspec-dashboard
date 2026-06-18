---
tags:
  - '#exec'
  - '#document-edit-hardening'
date: '2026-06-18'
modified: '2026-06-18'
step_id: 'S01'
related:
  - "[[2026-06-18-document-edit-hardening-plan]]"
---




# Resolve the brokered core invocation to the project-pinned environment instead of an arbitrary PATH binary

## Scope

- `engine/crates/ingest-struct/src/runner.rs`

## Description

- Rewrite `CoreRunner::detect` in `engine/crates/ingest-core/src/runner.rs` to memoize a resolved invocation via `OnceLock` instead of preferring a bare PATH binary.
- Add `resolve_core_invocation`: prefer the project-pinned uv-managed core (`uv run --no-sync vaultspec-core`), then a bare PATH core, accepting the first that actually ships the write verbs.
- Add `provides_write_verb`: a bounded capability probe that runs `vault set-body --help` and reads the exit status (capable core exits 0; a stale core answers "No such command" non-zero); a non-spawnable or empty invocation is never capable.
- Add a non-tautological unit test `provides_write_verb_reads_exit_status` exercising the exit-status branch through the OS shell plus the non-spawnable and empty cases.

## Outcome

`cargo test -p ingest-core --lib runner` compiles clean and all 8 runner tests pass, including the new probe test. The engine now resolves and verifies the project-pinned core (capability-checked, memoized so the probe spawns once) rather than silently brokering whatever stale binary is first on PATH, closing the resolution half of finding F1. The note in the plan scope (`ingest-struct`) is corrected here: the runner lives in `ingest-core`.

## Notes

- The capability VERIFICATION lives in the runner (`detect`) rather than the write boundary in `engine/crates/vaultspec-api/src/routes/ops.rs`, because `ops.rs` carries another agent's uncommitted changes in the shared tree and must not be clobbered. The S02 portion that degrades the write tier with an explicit advisory at the boundary (`ops.rs`) remains open until that file is free.
- This is a code-and-unit-test landing only. Making the running engine use it (S03 live-verify) requires a rebuild and restart of the shared resident engine (pid was 78648), which is disruptive to concurrent agents and is deferred to a coordinated step. Live writes currently work via the stopgap (the global `vaultspec-core` uv tool was upgraded 0.1.31 to 0.1.32).
