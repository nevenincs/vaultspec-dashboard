---
tags:
  - '#exec'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S06'
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
     The S06 and 2026-06-27-rag-affordance-adoption-plan placeholders are machine-filled by
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
     The Unit-test the unknown-option detection and the structured-reason extraction over JSON fixtures and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Unit-test the unknown-option detection and the structured-reason extraction over JSON fixtures

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added unit tests: `rag_start_args` appends `--json` after the validated flags (and still rejects a privileged port); `rag_rejected_json` detects the unknown-option error and not a genuine failure; `rag_start_failure` lifts the structured error+data and returns None for a success envelope or human text.

## Outcome

3 tests pass; the version-tolerant detection and the structured-reason extraction are regression-guarded over real JSON fixtures and a constructed `LifecycleRun`; clippy/fmt clean.

## Notes

The full async `start_rag_service` handler is not invoked (its probe needs a live rag); the pure helper tests cover the new logic, like the lifecycle handlers' existing coverage boundary.
