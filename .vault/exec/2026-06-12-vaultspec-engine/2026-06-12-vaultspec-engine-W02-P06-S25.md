---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S25'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the cold full-index orchestration with parallel per-view and per-source fan-out

## Scope

- `engine/crates/engine-graph/src/index.rs`

## Description

- Implement the cold full-index orchestration over one worktree scope: enumerate vault documents, parallel per-document read fan-out (rayon), build document nodes with frontmatter feature tags and per-scope facets, run extraction and resolution, ingest structural edges through the band-enforcing boundary.
- Implement `canonical_snapshot`: deterministic sorted serialization, the D8.2 comparator.

## Outcome

The same pipeline serves the one-shot CLI cold (no resident service required) and the serve mode warm - cold start is a feature (D2.4).

## Notes

Store writes stay on the coordinating thread (single-writer discipline); only read+extract fans out. Per-view fan-out (multiple scopes) composes trivially by running per-worktree indexes in parallel - single-view in v1 of this function.
