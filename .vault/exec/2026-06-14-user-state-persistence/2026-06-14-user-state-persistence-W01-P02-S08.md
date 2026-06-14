---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S08'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---




# add roundtrip and corrupt-recreate and recents-ordering tests

## Scope

- `engine/crates/vaultspec-session/tests/store_test.rs`

## Description

- Add `tests/store_test.rs` exercising the public `UserState` handle over the real on-disk SQLite store, with no mocks or doubles.
- Test (a): write active scope, a per-scope folder + feature-tag context, and a global and a scoped setting, then reopen from the same vault root and assert every value survives the process boundary.
- Test (b): establish content, overwrite the db file on disk with non-SQLite garbage (removing the WAL/SHM siblings so the corrupt header is what the opener sees), then reopen and assert no panic, an empty recreated store, and full usability after the heal.
- Test (c): assert recents are most-recent-first, dedupe a re-pushed entry to the front, survive reopen in order, and stay bounded to `MAX_RECENTS` with the oldest entries dropped.

## Outcome

All three integration tests pass alongside the ten unit tests. The roundtrip test proves real file persistence across reopen; the corrupt test proves the best-effort heal recreates empty without panicking; the recents test proves ordering, dedupe, and the bound hold across a reopen. The tests assert values derived from the specification, not copied from any run output.

## Notes

The corrupt-file test removes the `-wal` and `-shm` siblings before writing garbage so the opener parses the corrupt main-file header rather than replaying a valid WAL; this reliably forces the heal path the best-effort posture requires.