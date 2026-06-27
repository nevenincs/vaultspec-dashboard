---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S05'
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
     The S05 and 2026-06-27-rag-schema-gate-plan placeholders are machine-filled by
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
     The Unit-test the extractor and the gate across compatible, newer-version, dim-mismatch, missing-dense-name, and malformed-descriptor cases and ## Scope

- `engine/crates/rag-client/src/vectors.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Unit-test the extractor and the gate across compatible, newer-version, dim-mismatch, missing-dense-name, and malformed-descriptor cases

## Scope

- `engine/crates/rag-client/src/vectors.rs`

## Description

- Added nine unit tests in `vectors.rs`: the version gate (equal/older/none compatible, newer degrades); the extractor (reads version/name/dim from a real descriptor; tolerant of an absent schema block); and the full gate (compatible passes, pre-contract passes additively, newer-version degrades, dim-mismatch hard-refuses, wrong/missing dense name degrades, advertised-but-missing dim degrades).

## Outcome

All 46 rag-client tests pass (9 new), `cargo clippy -D warnings` is clean, and `cargo fmt --check` is clean for the crate.

## Notes

No mocks of engine logic; the gate is pure and the extractor reads real `serde_json::json!` descriptors.
