---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S01'
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
     The S01 and 2026-06-27-rag-schema-gate-plan placeholders are machine-filled by
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
     The Add the schema_version Option u64 field to HealthInfo and parse it from the /health body and ## Scope

- `engine/crates/rag-client/src/client.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the schema_version Option u64 field to HealthInfo and parse it from the /health body

## Scope

- `engine/crates/rag-client/src/client.rs`

## Description

- Added `schema_version: Option<u64>` (serde `default`) to the `HealthInfo` struct, documented as rag's bare storage-schema version - the cheapest pre-read gate, absent (`None`) in older rag builds.

## Outcome

The engine's `/health` parse now captures rag's bare schema version where present and tolerates its absence as `None`, so the running-probe already carries it for the cheap version gate.

## Notes

`#[serde(default)]` keeps an older rag's `/health` (no `schema_version`) parsing cleanly to `None`.
