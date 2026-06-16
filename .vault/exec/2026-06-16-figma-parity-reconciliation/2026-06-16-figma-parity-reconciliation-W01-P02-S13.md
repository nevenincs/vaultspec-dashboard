---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S13'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S13 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Enrich the node-evidence projection to the GUI shape (document path plus doc_type, corrected code-location field, commit subject) through the shared envelope and ## Scope

- `engine/crates/engine-query/src` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Enrich the node-evidence projection to the GUI shape (document path plus doc_type, corrected code-location field, commit subject) through the shared envelope

## Scope

- `engine/crates/engine-query/src`

## Description

- Enrich the engine `Evidence` projection to the GUI `NodeEvidence` shape: `documents` become `{ path, doc_type }` resolved from the graph node's doc_type and a `.vault/<doc_type>/<stem>.md` path, no longer bare stems.
- Correct the code-location field name by serializing `target` as `path` (GUI `code_locations[].path`), and add the optional `symbol` (parsed from a resolved `path#symbol` qualifier) and `line` fields while retaining the navigable `resolved_target`/`bridge_node_id` value-adds.
- Add a `subject` field to the correlated-commit item, defaulted empty in the pure graph projection (which has no git access).
- Add a read-only, per-sha `subjects_for` lookup to the git log module that rev-parses each requested sha and reads its commit summary, skipping unresolvable shas rather than failing the read.
- Fill the commit subjects in the `node_evidence` route from `subjects_for` over the active scope's workspace, then serialize through the shared `envelope` helper so the tiers block rides on the response.
- Update the evidence unit tests and add a serde test asserting the wire carries `documents[].path`/`doc_type`, `code_locations[].path` (no legacy `target`), and `commits[].subject`; add a `subjects_for` unit test.

## Outcome

The node-evidence wire shape now matches the GUI `NodeEvidence` type byte-for-byte for documents, code locations, and commits. The enrichment stays read-and-infer: only commit metadata is read from the object DB, no vault writes and no ref mutation. The engine crates build, `engine-query` and `ingest-git` tests pass, and `cargo fmt --check` plus `cargo clippy -D warnings` are clean on the three touched crates.

## Notes

The commit subject is sourced at the route seam (not the pure graph projection) because the projection has no git access, mirroring how the history route reads subjects. An unresolvable sha or a scope with no readable workspace leaves the subject empty rather than failing the evidence read.
