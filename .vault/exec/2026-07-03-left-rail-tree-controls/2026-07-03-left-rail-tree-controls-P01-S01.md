---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

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
