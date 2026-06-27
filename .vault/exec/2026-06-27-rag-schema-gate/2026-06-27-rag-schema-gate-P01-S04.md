---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S04'
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
     The S04 and 2026-06-27-rag-schema-gate-plan placeholders are machine-filled by
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
     The Implement the pure storage_schema_supported gate applying the newer-version, dense-name, and dimension rules with a typed reason and ## Scope

- `engine/crates/rag-client/src/vectors.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement the pure storage_schema_supported gate applying the newer-version, dense-name, and dimension rules with a typed reason

## Scope

- `engine/crates/rag-client/src/vectors.rs`

## Description

- Implemented `storage_schema_version_supported(Option<u64>)`: the cheap version rule - `None`/equal/older compatible, strictly-newer a stated-reason degrade.
- Implemented `storage_schema_supported(&StorageSchemaFacts)`: a pre-contract rag (no contract advertised) passes additively; otherwise apply the version rule, require a dense vector named exactly `dense`, and require the effective dim to equal `EXPECTED_DENSE_DIM`, each mismatch returning a stated reason.

## Outcome

The engine has rag's compatibility recipe as a pure, typed gate: newer-version → degrade, dense-name-must-exist/match, dim-mismatch → hard refuse, with a pre-contract escape that prevents a regression against older rag.

## Notes

The full gate re-checks the version (defense in depth) so the descriptor's version is authoritative even if `/health` and `/readiness` ever disagreed.
