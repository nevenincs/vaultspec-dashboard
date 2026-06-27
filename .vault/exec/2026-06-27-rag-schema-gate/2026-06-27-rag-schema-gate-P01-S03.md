---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S03'
related:
  - "[[2026-06-27-rag-schema-gate-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace rag-schema-gate with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S03 and 2026-06-27-rag-schema-gate-plan placeholders are machine-filled by
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
     The Implement a tolerant extractor pulling version, dense vector name, and effective dim from the /readiness descriptor value and ## Scope

- `engine/crates/rag-client/src/vectors.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement a tolerant extractor pulling version, dense vector name, and effective dim from the /readiness descriptor value

## Scope

- `engine/crates/rag-client/src/vectors.rs`

## Description

- Added the `StorageSchemaFacts` struct (version, dense_name, dense_dim - all `Option`) with an `advertises_contract()` helper distinguishing a pre-contract rag from a contract-advertising one.
- Implemented `extract_storage_schema_facts(&Value)` pulling `schema.version` and `schema.vault.vectors.dense.{name,dim}` from the `/readiness` descriptor tolerantly (a missing/mistyped field is `None`).

## Outcome

The engine can read rag's advertised descriptor without hard-parsing - every field is optional, an absent field resolved by the gate rather than a panic.

## Notes

`advertises_contract()` is what keeps the gate additive for an older rag (no schema block → no contract → no degrade).
