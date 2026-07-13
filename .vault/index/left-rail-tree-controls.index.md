---
generated: true
tags:
  - '#index'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-12'
related:
  - '[[2026-07-03-left-rail-tree-controls-P01-S01]]'
  - '[[2026-07-03-left-rail-tree-controls-P01-S02]]'
  - '[[2026-07-03-left-rail-tree-controls-P01-S03]]'
  - '[[2026-07-03-left-rail-tree-controls-P02-S04]]'
  - '[[2026-07-03-left-rail-tree-controls-P02-S05]]'
  - '[[2026-07-03-left-rail-tree-controls-P02-S06]]'
  - '[[2026-07-03-left-rail-tree-controls-P03-S07]]'
  - '[[2026-07-03-left-rail-tree-controls-P03-S08]]'
  - '[[2026-07-03-left-rail-tree-controls-P03-S09]]'
  - '[[2026-07-03-left-rail-tree-controls-P03-S10]]'
  - '[[2026-07-03-left-rail-tree-controls-P04-S11]]'
  - '[[2026-07-03-left-rail-tree-controls-P04-S12]]'
  - '[[2026-07-03-left-rail-tree-controls-P05-S13]]'
  - '[[2026-07-03-left-rail-tree-controls-P05-S14]]'
  - '[[2026-07-03-left-rail-tree-controls-adr]]'
  - '[[2026-07-03-left-rail-tree-controls-plan]]'
  - '[[2026-07-03-left-rail-tree-controls-research]]'
---

# `left-rail-tree-controls` feature index

Auto-generated index of all documents tagged with `#left-rail-tree-controls`.

## Documents

### adr

- `2026-07-03-left-rail-tree-controls-adr` - `left-rail-tree-controls` adr: `the left rail as a review surface: signals, sorting, reset verbs, indent guides` | (**status:** `accepted`)

### exec

- `2026-07-03-left-rail-tree-controls-P01-S01` - Compute `size_bytes` and `word_count` at ingest on the already-read document body and carry them as an optional facet on the document `Node`
- `2026-07-03-left-rail-tree-controls-P01-S02` - Emit `size: { bytes, words }` on `/vault-tree` rows in `build_vault_tree_rows` with a row-builder unit test
- `2026-07-03-left-rail-tree-controls-P01-S03` - Adapt the new `size` field tolerantly (+ `VaultTreeEntry` in `engine.ts`): validate non-negative integers, drop malformed, absent stays absent
- `2026-07-03-left-rail-tree-controls-P02-S04` - Add status/tier/size presentation helpers (plain-language status + tier labels, compact word-count label), delete the stale plan-progress honesty note
- `2026-07-03-left-rail-tree-controls-P02-S05` - Render leaf review signals: plan-status pip + done/total, ADR acceptance status token, authored `created` date as default date meta, size meta, full path+dates+size tooltip
- `2026-07-03-left-rail-tree-controls-P02-S06` - Extend render tests: status token, progress pip, created-date meta, size meta, honest absence on undated/sizeless entries
- `2026-07-03-left-rail-tree-controls-P03-S07` - New persisted view-local sort store (key: recency|name|created|modified|size, direction, default recency/desc) with one reset path on workspace swap
- `2026-07-03-left-rail-tree-controls-P03-S08` - Thread the sort into `deriveVaultRailView`: document order inside category folders and feature-folder order derive from the one sort value
- `2026-07-03-left-rail-tree-controls-P03-S09` - Author the shared sort + reset-sorting action descriptors (`left-rail:sort-*`, `left-rail:reset-sorting`) and palette enrollment
- `2026-07-03-left-rail-tree-controls-P03-S10` - Rail-top sort control beside the filter field (Vault mode only) and `vault-section` menu enrollment of sort, reset-sorting, reset-filters, clear-filter, toggle-facets verbs
- `2026-07-03-left-rail-tree-controls-P04-S11` - Vertical indent guide lines on `[data-vault-folder-body]`: 1px border-ink line per level at the rows' rem indent math, theme-aware token color
- `2026-07-03-left-rail-tree-controls-P04-S12` - Full gate (`just dev lint all`), targeted vitest suites (tree render, menus, action coverage, filter guard), live verify on the canonical port
- `2026-07-03-left-rail-tree-controls-P05-S13` - Add `docs` and `weight` sort keys: option registry, projection comparators, feature `weightBytes` aggregate + `totalCorpusBytes` denominator
- `2026-07-03-left-rail-tree-controls-P05-S14` - Display the corpus-weight percent on feature rows under the weight sort, byte-size leaf meta, and verify compact-viewport parity live at phone width

### plan

- `2026-07-03-left-rail-tree-controls-plan` - `left-rail-tree-controls` plan

### research

- `2026-07-03-left-rail-tree-controls-research` - `left-rail-tree-controls` research: `tree metadata, sorting, reset actions, and indent guides`
