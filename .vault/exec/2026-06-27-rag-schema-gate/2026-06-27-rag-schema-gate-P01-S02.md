---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S02'
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
     The S02 and 2026-06-27-rag-schema-gate-plan placeholders are machine-filled by
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
     The Pin KNOWN_STORAGE_SCHEMA_VERSION and EXPECTED_DENSE_DIM as the engine's declared-compatibility constants and ## Scope

- `engine/crates/rag-client/src/vectors.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Pin KNOWN_STORAGE_SCHEMA_VERSION and EXPECTED_DENSE_DIM as the engine's declared-compatibility constants

## Scope

- `engine/crates/rag-client/src/vectors.rs`

## Description

- Pinned `KNOWN_STORAGE_SCHEMA_VERSION = 1` and `EXPECTED_DENSE_DIM = 1024` as the engine's declared compatibility, documented as the storage-schema analog of the pinned Qdrant major.
- Added `DENSE_VECTOR_NAME = "dense"` (the name the scroll requests) as the gate's expected vector name.

## Outcome

The engine now declares what storage shape it understands; bumping these constants is a deliberate, reviewed "the engine now understands rag's new shape" change.

## Notes

The constants are reviewed code, never trusted live from rag - the engine declares its own support.
