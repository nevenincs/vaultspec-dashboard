---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S08'
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
     The S08 and 2026-06-27-rag-storage-broker-plan placeholders are machine-filled by
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
     The Add route-level tests asserting an unknown verb 403s, a malformed prefix 400s, the default request previews, and an apply request passes yes and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add route-level tests asserting an unknown verb 403s, a malformed prefix 400s, the default request previews, and an apply request passes yes

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added `storage_route_403s_unknown_verb_and_400s_a_bad_prefix_before_spawning` (a `#[tokio::test]`): calls `ops_rag_storage` directly with a built `AppState` and asserts an unknown verb returns 403 and a `storage-delete` with a malformed prefix returns 400 - both before any subprocess.

## Outcome

The route's pre-subprocess gates (whitelist 403, validation 400) are regression-guarded; the preview/apply argv paths are covered by the `storage_args_for` unit tests (the runner spawns the rag CLI, which is not present in the test environment).

## Notes

The route test asserts only the spawn-free paths; exercising the full spawn would need a live rag and is the no-mocks-mandate boundary, like the lifecycle verbs.
