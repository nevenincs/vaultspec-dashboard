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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S08 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The add roundtrip and corrupt-recreate and recents-ordering tests and ## Scope

- `engine/crates/vaultspec-session/tests/store_test.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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