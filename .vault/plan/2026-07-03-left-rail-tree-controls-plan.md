---
tags:
  - '#plan'
  - '#left-rail-tree-controls'
date: '2026-07-03'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-07-03-left-rail-tree-controls-adr]]'
  - '[[2026-07-03-left-rail-tree-controls-research]]'
---
# `left-rail-tree-controls` plan

### Phase `P01` - Engine: size and word-count on the vault-tree wire

ADR D2: ingest-computed size_bytes and word_count carried on the document Node and emitted on /vault-tree rows; tolerant adapter + VaultTreeEntry extension

- [x] `P01.S01` - Compute `size_bytes` and `word_count` at ingest on the already-read document body and carry them as an optional facet on the document `Node`; `engine/crates/engine-model/src/lib.rs`.
- [x] `P01.S02` - Emit `size: { bytes, words }` on `/vault-tree` rows in `build_vault_tree_rows` with a row-builder unit test; `engine/crates/engine-query/src/graph.rs`.
- [x] `P01.S03` - Adapt the new `size` field tolerantly (+ `VaultTreeEntry` in `engine.ts`): validate non-negative integers, drop malformed, absent stays absent; `frontend/src/stores/server/liveAdapters.ts`.

### Phase `P02` - Rail rows render the review signals

ADR D1: ADR acceptance status, plan tier + progress pip, authored created date, size meta, full-metadata tooltip on the vault tree leaves

- [x] `P02.S04` - Add status/tier/size presentation helpers (plain-language status + tier labels, compact word-count label), delete the stale plan-progress honesty note; `frontend/src/app/left/vaultRowPresentation.ts`.
- [x] `P02.S05` - Render leaf review signals: plan-status pip + done/total, ADR acceptance status token, authored `created` date as default date meta, size meta, full path+dates+size tooltip; `frontend/src/app/left/TreeBrowser.tsx`.
- [x] `P02.S06` - Extend render tests: status token, progress pip, created-date meta, size meta, honest absence on undated/sizeless entries; `frontend/src/app/left/VaultBrowser.render.test.tsx`.

### Phase `P03` - Vault sort plane and reset verbs

ADR D3+D4: persisted view-local railSort store consumed by deriveVaultRailView, sort controls (rail top, section menu, palette), reset-verb enrollment in the vault-section menu

- [x] `P03.S07` - New persisted view-local sort store (key: recency|name|created|modified|size, direction, default recency/desc) with one reset path on workspace swap; `frontend/src/stores/view/railSort.ts`.
- [x] `P03.S08` - Thread the sort into `deriveVaultRailView`: document order inside category folders and feature-folder order derive from the one sort value; `frontend/src/stores/server/queries.ts`.
- [x] `P03.S09` - Author the shared sort + reset-sorting action descriptors (`left-rail:sort-*`, `left-rail:reset-sorting`) and palette enrollment; `frontend/src/stores/view/leftRailKeybindings.ts`.
- [x] `P03.S10` - Rail-top sort control beside the filter field (Vault mode only) and `vault-section` menu enrollment of sort, reset-sorting, reset-filters, clear-filter, toggle-facets verbs; `frontend/src/app/left`.

### Phase `P04` - Indent guides and verification

ADR D5: token-colored rem-aligned vertical indent guides on folder bodies; full gate + live verify

- [x] `P04.S11` - Vertical indent guide lines on `[data-vault-folder-body]`: 1px border-ink line per level at the rows' rem indent math, theme-aware token color; `frontend/src/app/left/TreeBrowser.tsx`.
- [x] `P04.S12` - Full gate (`just dev lint all`), targeted vitest suites (tree render, menus, action coverage, filter guard), live verify on the canonical port; `frontend`.

### Phase `P05` - Sort extensions and mobile parity

ADR D3a: Document Count and Corpus Weight sort keys (normalized byte share over the whole vault), weight-share display on feature rows, compact-viewport parity verification

- [x] `P05.S13` - Add `docs` and `weight` sort keys: option registry, projection comparators, feature `weightBytes` aggregate + `totalCorpusBytes` denominator; `frontend/src/stores`.
- [x] `P05.S14` - Display the corpus-weight percent on feature rows under the weight sort, byte-size leaf meta, and verify compact-viewport parity live at phone width; `frontend/src/app/left`.

## Description

Make the left rail a review surface, executing the accepted
`left-rail-tree-controls` ADR (D1..D5) over the grounding research. Almost
every signal is already served by `/vault-tree` and adapted into
`VaultTreeEntry` (ADR status, plan tier, checkbox progress, all three dates);
P02 renders them. P01 lands the one genuine wire extension (ingest-computed
`size_bytes` + `word_count`, additive and optional). P03 adds the view-local
persisted sort plane and enrolls the existing reset verbs (plus the new
reset-sorting verb) into the rail's own menus through the shared action
builders. P04 draws the standard tree-view vertical indent guides and runs
the full verification gate. Files (code) mode is untouched: fixed
directories-first alphabetical order, no sort control (user direction).

## Steps

## Parallelization

P01 (engine wire) and P03 (sort plane) are independent and may run in
parallel. P02 depends on P01.S03 only for the SIZE meta (the status /
progress / date signals ride already-adapted fields, so P02.S04-S05 may start
alongside P01 and fold size in last). P04.S11 (guides) is independent of
everything; P04.S12 (gate + live verify) is strictly last. Within P03, S07
and S09 precede S08 and S10.

## Verification

- `just dev lint all` exits 0 (engine touched: fmt + clippy included).
- Engine row-builder test asserts `size` on a sized fixture doc and absence
  on a size-less node; adapter test asserts malformed `size` is dropped.
- Rail render tests assert: plan row shows progress pip + done/total; ADR
  row shows its acceptance status; leaf date meta is the authored `created`
  date; size meta renders when served and nothing when absent.
- Sort: switching key/direction reorders the tree; default equals today's
  recency order byte-for-byte; the persisted value survives reload; reset
  restores the default; the code tree offers no sort control.
- Vault-section context menu lists expand/collapse, sort options,
  reset-sorting, reset-filters, clear-filter, toggle-facets, new document;
  action-coverage and palette guard suites stay green.
- Indent guides render at every expanded folder level in all themes, rem-
  aligned (no px scan violations: `lint:px` clean).
- Live verify against the canonical dev port shows the signals on the real
  vault corpus.
