---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S06'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
---

# Mint file nodes, module nodes for source-bearing directories, contains edges, and deduplicated multiplicity-counted imports edges

## Scope

- `engine/crates/ingest-code/src/modules.rs`

## Description

Mint file nodes (code:{path}, content-hash facet), module nodes for source-bearing dirs (code-mod:{dir}), contains edges (tree-layout provenance) incl. the parent-module forest, and per-(src,dst) deduplicated imports edges at structural/resolved/0.9 with multiplicity.

## Outcome

2 minting tests green incl. the edge-id stability pin: an edit that moves an import's span/blob re-derives the SAME edge id (volatile-free stable keys).

## Notes
