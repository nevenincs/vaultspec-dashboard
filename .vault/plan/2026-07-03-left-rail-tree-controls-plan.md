---
tags:
  - '#plan'
  - '#left-rail-tree-controls'
date: '2026-07-03'
modified: '2026-07-04'
tier: L2
related:
  - '[[2026-07-03-left-rail-tree-controls-adr]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #plan) and one feature tag.
     Replace left-rail-tree-controls with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     tier is mandatory for new plans. Allowed: L1, L2, L3, L4.
     L1 = Steps only. L2 = Phases above Steps. L3 = Waves above
     Phases above Steps. L4 = Epic above Waves above Phases above
     Steps; PM association required. Pre-existing plans without this
     field default to L2.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'. The related field
     carries the AUTHORIZING documents (ADR, research, reference, prior
     plan) for every Step in this plan; Steps inherit this chain;
     per-row reference footers do not exist.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->


<!-- HIERARCHY AND TIERS:
     Epic > Wave > Phase > Step. Step is the canonical leaf-row
     noun. Execution Record artifact: <Step Record>.
     Tier is declared in frontmatter as tier: L1/L2/L3/L4
     (mandatory for new plans; pre-existing plans without the
     field default to L2 and the writer adds the field on first
     edit). The tier selects containers:
       L1 = Steps only.
       L2 = Phases above Steps.
       L3 = Waves above Phases above Steps.
       L4 = Epic above Waves above Phases above Steps; MUST declare
            a project-management association in the Epic intent
            block prose.
     Selection is by complexity criteria, not container counting.
     Writer never invents containers to qualify a tier. -->

<!-- IDENTIFIERS AND ROW CONTRACT:
     S##, P##, W## are flat, per-document, append-only, immutable.
     Promotion adds containers without renumbering. Gaps are not
     reused.
     Display paths are computed from current grouping:
       Step path:    L1 S##   L2 P##.S##   L3/L4 W##.P##.S##
       Phase heading:        L2 P##       L3/L4 W##.P##
       Wave heading:                      L3/L4 W##
     Row format:
       - [ ] `<display-path>` - imperative-verb action; `path/to/file`.
     Two-state checkboxes only ([ ] open, [x] closed). No per-row
     reference footers; wiki-links and markdown links are forbidden
     in plan body. Authorizing documents go in the plan's `related:`
     frontmatter once.
     ASCII spaced hyphens everywhere; em-dash (U+2014) and en-dash
     (U+2013) are forbidden. Step rows within a Phase are
     contiguous. -->

<!-- NO COMPRESSION:
     N self-similar actions = N rows. Never collapse into "for each
     X, do Y" / "across all callers, do Z" / "in every module,
     replace W". The rule applies at every tier including L1. -->

<!-- VAULTSPEC-CORE VAULT PLAN CLI:
     The `vaultspec-core vault plan` CLI is the canonical surface for
     structural manipulation of this plan document. Writers and
     executors MUST use `vaultspec-core vault plan step add/insert/move/
     remove/check/uncheck/toggle/edit`,
     `vaultspec-core vault plan phase add/move/remove/edit`,
     `vaultspec-core vault plan wave add/move/remove/edit`,
     `vaultspec-core vault plan epic intent`, and
     `vaultspec-core vault plan tier promote/demote` for every
     identifier-affecting change rather than hand-editing the row
     grammar. Hand edits are tolerated by the parser but flagged by
     `vaultspec-core vault plan check`; canonical-identifier preservation is
     guaranteed only when the CLI performs the mutation. Run
     `vaultspec-core vault plan --help` for the full subcommand
     surface. -->

# `left-rail-tree-controls` plan

### Phase `P01` - Engine: size and word-count on the vault-tree wire

ADR D2: ingest-computed size_bytes and word_count carried on the document Node and emitted on /vault-tree rows; tolerant adapter + VaultTreeEntry extension


<!-- One-line headline summary plan. -->

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

<!-- The plan's tier (declared in frontmatter as `tier: L1`, `L2`, `L3`, or
`L4`) determines the structure under this section:

- `L1`: a flat list of Step rows (no Phase, Wave, or Epic).
- `L2`: one or more `### Phase` blocks each containing Step rows.
- `L3`: one or more `## Wave` blocks each containing Phase blocks.
- `L4`: a `## Epic intent` block, followed by Wave blocks. -->

<!-- Replace this scaffold with the tier-appropriate structure for your plan.
Format examples for each block type are embedded below as commented
templates. -->

<!-- IMPORTANT: This document must be updated between execution runs to
     track progress. -->

<!-- PHASE BLOCK FORMAT (L2, L3, L4):
     ### Phase `P02` - rewrite the writer-agent contract

     One sentence stating what this Phase delivers.

     - [ ] `P02.S01` - imperative-verb action; `path/to/file`.
     - [ ] `P02.S02` - imperative-verb action; `path/to/file`.

     At L3/L4 the Phase heading uses the ancestor-aware path
     (### Phase `W01.P02` - ...). The intent sentence is mandatory. -->

<!-- WAVE BLOCK FORMAT (L3, L4):
     ## Wave `W01` - language-only convention rollout

     One paragraph stating what this Wave delivers, which downstream
     Wave depends on it, and which authorizing documents back it.

     ### Phase `W01.P01` - ...
     ### Phase `W01.P02` - ...

     The Wave intent paragraph is mandatory. -->

<!-- EPIC INTENT BLOCK FORMAT (L4 only):
     ## Epic intent

     One paragraph stating the strategic goal, the external project-
     management association (milestone name, project board identifier,
     roadmap entry), the timeline horizon, and the teams or agents
     involved.

     ## Wave `W01` - ...
     ## Wave `W02` - ...

     The ## Epic intent block is mandatory at L4 and absent at L1, L2,
     L3. The plan title (the level-one # heading at the top of the
     document) is the Epic title; no separate Epic heading is emitted. -->

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
