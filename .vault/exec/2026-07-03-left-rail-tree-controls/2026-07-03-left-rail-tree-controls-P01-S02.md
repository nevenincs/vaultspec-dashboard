---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-12'
step_id: 'S02'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

# Emit `size: { bytes, words }` on `/vault-tree` rows in `build_vault_tree_rows` with a row-builder unit test

## Scope

- `engine/crates/engine-query/src/graph.rs`

## Description

- Emit `"size": n.size` on `/vault-tree` rows in `build_vault_tree_rows` (`engine/crates/engine-query/src/graph.rs`)
- Add `vault_tree_rows_carry_size_and_absent_size_serves_null` row-builder test

## Outcome

Test passes: sized fixture serves bytes/words; size-less node serves an honest null.

## Notes

None.
