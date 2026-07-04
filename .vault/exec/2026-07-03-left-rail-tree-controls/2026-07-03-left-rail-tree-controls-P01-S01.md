---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S01'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace left-rail-tree-controls with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-07-03-left-rail-tree-controls-plan placeholders are machine-filled by
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
     The Compute `size_bytes` and `word_count` at ingest on the already-read document body and carry them as an optional facet on the document `Node` and ## Scope

- `engine/crates/engine-model/src/lib.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Compute `size_bytes` and `word_count` at ingest on the already-read document body and carry them as an optional facet on the document `Node`

## Scope

- `engine/crates/engine-model/src/lib.rs`

## Description

- Add `DocSize { bytes, words }` + `DocSize::measure` (whitespace-split, O(bytes)) to `engine/crates/engine-model/src/lib.rs`
- Add optional `size` facet to `Node` (`#[serde(default, skip_serializing_if)]` — old caches stay deserializable)
- Measure at ingest on the already-held body in `engine/crates/engine-graph/src/index.rs`; blob-true measure on as-of reads in `asof.rs`; `None` on rule/code nodes
- Update every `Node` initializer across the workspace (`size: None`) compiler-guided

## Outcome

Workspace compiles clean; `cargo test --workspace` green (one pre-existing environmental rag e2e failure, untouched surface).

## Notes

None.
