---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S05'
related:
  - "[[2026-06-27-rag-storage-broker-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace rag-storage-broker with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S05 and 2026-06-27-rag-storage-broker-plan placeholders are machine-filled by
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
     The Unit-test the prefix guard, the argv assembly per verb, and the runner envelope-forwarding-on-exit-1 versus 502-on-fault and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Unit-test the prefix guard, the argv assembly per verb, and the runner envelope-forwarding-on-exit-1 versus 502-on-fault

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added unit tests: the prefix guard (canonical accepted; uppercase/wrong-length/non-hex/flag/metachar rejected); `storage_args_for` per verb (delete/prune/migrate argv exact, dry-run-default vs apply, no `--allow-unknown`, migrate root is the passed cell root); the missing-prefix and bad-backend 400s; and `is_rag_envelope` + `storage_outcome` (would_remove exits 1 yet forwards, crash 502s, empty-on-exit-0 502s).

## Outcome

The primitives are regression-guarded: 5 storage tests plus the prefix test pass, cross-platform (no subprocess fixture). `cargo clippy -D warnings` and `cargo fmt --check` clean.

## Notes

No mocks; the argv assembly and outcome logic are pure and exercised directly with a real `build_state` AppState.
