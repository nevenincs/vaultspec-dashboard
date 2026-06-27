---
tags:
  - '#exec'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S02'
related:
  - "[[2026-06-27-rag-affordance-adoption-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace rag-affordance-adoption with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S02 and 2026-06-27-rag-affordance-adoption-plan placeholders are machine-filled by
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
     The Unit-test that the machine-global pointer is the first candidate and an absent pointer is skipped and ## Scope

- `engine/crates/rag-client/src/client.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Unit-test that the machine-global pointer is the first candidate and an absent pointer is skipped

## Scope

- `engine/crates/rag-client/src/client.rs`

## Description

- Added `the_storage_parent_machine_pointer_is_the_first_candidate` (the pointer is index 0, ahead of the STATUS_DIR-default file) and `an_absent_machine_pointer_is_skipped_for_a_present_status_file` (a real `discover_at` over an absent pointer + a present fresh status file discovers via the present one).

## Outcome

3 candidate tests pass (the 2 new + the existing precedence test); the additive, tolerant behavior is regression-guarded; clippy/fmt clean.

## Notes

No mocks; the skip test writes a real temp status file with a fresh heartbeat.
