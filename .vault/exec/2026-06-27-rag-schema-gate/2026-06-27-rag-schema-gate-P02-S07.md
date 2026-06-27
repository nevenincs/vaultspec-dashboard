---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S07'
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
     The S07 and 2026-06-27-rag-schema-gate-plan placeholders are machine-filled by
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
     The Read the /readiness descriptor and apply the dense-name and dimension gate before the scroll, degrading through the existing closure and ## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Read the /readiness descriptor and apply the dense-name and dimension gate before the scroll, degrading through the existing closure

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Added stage 2: only when rag advertised a contract (`schema_version.is_some()`) the handler reads `/readiness` over the service port (`control::readiness`), extracts the facts, and applies `storage_schema_supported`, degrading through the closure on a dense-name or dimension mismatch.
- A `/readiness` read failure degrades (fail closed) with the transport reason stated, since the shape cannot be validated before the direct read.

## Outcome

The dense vector name and effective dimension are validated against the engine's pins before the scroll; a pre-contract rag (`None`) skips the descriptor read entirely (additive, no regression, zero extra round-trips).

## Notes

The `vaultspec-api` crate builds clean; the gate composition is covered by the S08 test and the rag-client unit tests.
