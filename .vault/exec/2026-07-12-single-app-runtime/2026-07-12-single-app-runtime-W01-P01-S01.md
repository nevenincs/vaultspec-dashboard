---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Make the discovery write atomic (write-temp then rename) and owner-checked so a serve only overwrites a discovery file carrying its own pid, with a unit test proving two concurrent writers cannot interleave

## Scope

- `engine/crates/vaultspec-api/src/app.rs`

## Description

- Split the discovery write into `discovery_payload`, `write_discovery_atomic` (pid-suffixed temp + rename publish, unix 0600 applied before rename), and the boot claim `write_service_json`.
- Add `heartbeat_service_json`: reads the on-disk file first and refuses with a typed error when it carries a foreign pid; the serve heartbeat loop now calls it.
- Add `discovery_writes_are_atomic_under_concurrent_writers` (two hammering writers + polling reader, every read parses as one writer's full payload) and `heartbeat_refuses_to_overwrite_a_foreign_pid`.

## Outcome

Atomic publish + owner-checked heartbeat land in `engine/crates/vaultspec-api/src/app.rs`; both unit tests pass; the same-workspace heartbeat clobber race is dead.

## Notes

The plain `fs::write` it replaced demonstrably fails the concurrent-writer test.
