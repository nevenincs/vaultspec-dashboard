---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S08'
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
     The S08 and 2026-06-27-rag-schema-gate-plan placeholders are machine-filled by
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
     The Add a route-level test asserting a newer schema_version and a dimension mismatch each degrade the embedding tier with the reason stated and ## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a route-level test asserting a newer schema_version and a dimension mismatch each degrade the embedding tier with the reason stated

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Added `storage_schema_gate_wiring_degrades_on_newer_version_and_dim_mismatch` to the `query.rs` test module: it runs the handler's exact two-stage composition - stage 1 (`storage_schema_version_supported` off the `/health` version) degrades on newer and passes on equal; stage 2 (`extract_storage_schema_facts` + `storage_schema_supported` off a realistic `/readiness` JSON) hard-refuses a dimension mismatch and passes a compatible descriptor.

## Outcome

The wiring decision (which gate runs, in what order, with what reason) is regression-guarded in the route module; the test passes (`cargo test -p vaultspec-api --lib`).

## Notes

The async `graph_embeddings` handler itself is not invoked: its `probe_machine_state` reads `service.json` + `/health`, needing a live rag, which the no-mocks mandate forbids faking at the handler boundary. The gate composition test plus the nine rag-client unit tests cover the behavior end to end.
