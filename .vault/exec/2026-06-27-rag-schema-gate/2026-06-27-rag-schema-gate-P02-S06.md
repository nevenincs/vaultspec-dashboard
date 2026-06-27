---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S06'
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
     The S06 and 2026-06-27-rag-schema-gate-plan placeholders are machine-filled by
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
     The Apply the cheap /health schema_version gate after the Qdrant capability gate, degrading on a newer version before the /readiness round-trip and ## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Apply the cheap /health schema_version gate after the Qdrant capability gate, degrading on a newer version before the /readiness round-trip

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Captured `health.schema_version` in the probe match (the handler previously dropped `health`), binding `(info, qdrant_version, schema_version)`.
- Applied the cheap stage-1 version gate (`storage_schema_version_supported(schema_version)`) immediately after the Qdrant capability gate, degrading through the existing `degraded_embeddings` closure on a newer version - before any `/readiness` round-trip.

## Outcome

A rag advertising a newer storage-schema version short-circuits to an honest degrade using the `/health` data the running-probe already fetched, adding zero round-trips on the fail-fast path.

## Notes

The reason string is produced by the gate (states the version drift); the handler forwards it verbatim, mirroring the Qdrant-capability-gate reason.
