---
tags:
  - '#plan'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-07-12-touch-selectability-adr]]'
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

# `touch-selectability` plan

### Phase `P01` - Selection-guard substrate

Author the one shared selection-guard mechanism and predicate hardening every later surface routes through (ADR D1): the guarded context-menu helper that yields to a live non-collapsed selection, the same clause in the background handler, and a proper island target predicate.

- [x] `P01.S01` - Author the shared selection-guard helper that yields the app context menu to a live non-collapsed text selection intersecting the target, plus its yield/open unit matrix; `frontend/src/app/menus/guardedContextMenu.ts`.
- [x] `P01.S02` - Route the background empty-space handler through the same selection-guard clause so future text-bearing background surfaces inherit it; `frontend/src/app/menus/backgroundContextMenu.ts`.
- [x] `P01.S03` - Scope the island context-menu handler with a target predicate like the rail and timeline predicates so nested data targets stop being blanketed; `frontend/src/app/islands/IslandLayer.tsx`.

### Phase `P02` - High-severity menu-online surface sweep

Route every audited menu-online hijack through the guard and re-enable selection on the data text beneath (ADR D1 plus D2): viewer prose, reader wiki-links, left-rail trees and picker rows, right-rail inspector and status rows, doc tabs, islands.

- [x] `P02.S04` - Route the whole-viewer vault-doc context-menu hijack through the selection guard so selected prose keeps its native menu; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `P02.S05` - Render wiki-links and Related-footer stems as selectable anchor-shaped elements with unchanged activation so prose ranges stay contiguous; `frontend/src/app/viewer/MarkdownReader.tsx`.
- [x] `P02.S06` - Re-enable text selection on vault tree row data text and route the row menus through the selection guard; `frontend/src/app/left/TreeBrowser.tsx`.
- [x] `P02.S07` - Re-enable text selection on code tree row path text and route the code-file menu through the selection guard; `frontend/src/app/left/CodeTree.tsx`.
- [x] `P02.S08` - Re-enable text selection on worktree, project, and recent row data text and route the worktree menu through the selection guard; `frontend/src/app/left/WorktreePicker.tsx`.
- [x] `P02.S09` - Re-enable selection on inspector node title, property values, and edge row labels and guard the node and edge menu opens; `frontend/src/app/right/Inspector.tsx`.
- [x] `P02.S10` - Re-enable selection on commit hash, subject, and age text and guard the commit and pull-request row menu opens; `frontend/src/app/right/StatusTab.tsx`.
- [x] `P02.S11` - Scope doc tab title selection to the title span so tab dragging survives, and guard the doc-tab menu open; `frontend/src/app/stage/DockWorkspace.tsx`.
- [x] `P02.S12` - Re-enable selection on island interior chips and step titles beneath the newly scoped island menu; `frontend/src/app/islands/NodeInterior.tsx`.

### Phase `P03` - Pickers, palettes, and latent rows

Apply the D2 row-selectability convention to surfaces without live menus so the latent defect never matures: palette and picker result rows, the timeline range readout carve-out, and the medium-severity right-rail rows.

- [x] `P03.S13` - Re-enable selection on command, document-search, and semantic-search result row data text across the palette surfaces; `frontend/src/app/palette/`.
- [x] `P03.S14` - Re-enable selection on combobox and feature-suggestion option data text in the viewer and left-rail pickers; `frontend/src/app/viewer/AutocompleteCombobox.tsx`.
- [x] `P03.S15` - Carve the computed date-range readout out of the timeline scrubber selection suppression; `frontend/src/app/timeline/TimelineRangeSelector.tsx`.
- [x] `P03.S16` - Re-enable selection on plan pill titles, changed-file names, and plan-step headings in the latent right-rail rows; `frontend/src/app/right/`.
- [x] `P03.S17` - Re-enable selection on workspace switcher and project navigator row names on the compact shell; `frontend/src/app/shell/WorkspaceSwitcherSheet.tsx`.

### Phase `P04` - Touch entry and gesture yield

Give touch a deliberate menu entry and reserve long-press for selection (ADR D3): the coarse-pointer per-row disclosure affordance over the openContextMenu seam, Android long-press routed through the guard, and the compact reader edge-swipe yielding to an active selection.

- [x] `P04.S18` - Add the coarse-pointer per-row menu disclosure affordance over the openContextMenu seam for menu-bearing rows; `frontend/src/app/chrome/RowMenuDisclosure.tsx`.
- [x] `P04.S19` - Mount the disclosure affordance on compact menu-bearing surfaces and confirm Android long-press routes through the selection guard; `frontend/src/app/shell/`.
- [x] `P04.S20` - Yield the compact reader edge-swipe recognizer while a text selection is active; `frontend/src/app/shell/CompactDocReader.tsx`.

### Phase `P05` - Guards and gate

Engrave the laws as failing-loud tests (ADR D4) and close the pipeline green: the selection-guard matrix suite, the row-selectability sweep assertion, island predicate tests, and the full frontend lint gate plus test suite.

- [ ] `P05.S21` - Author the row-selectability sweep assertion over menu-bearing surfaces and the island predicate suite alongside the guard matrix; `frontend/src/app/menus/guardedContextMenu.test.ts`.
- [ ] `P05.S22` - Run the full frontend lint gate and the complete vitest suite and reconcile any regression to green; `frontend/`.

## Description

Unify text selection and touch interactivity across the full frontend per the
accepted ADR in `related:` and the grounding audit it derives from. Three mechanisms
land: one shared selection guard so an app context menu never steals the native
selected-text menu (D1); the data/chrome row convention that re-enables selection on
corpus data text everywhere while keeping `select-none` scoped to presentation
adjuncts (D2); and a deliberate touch entry to the menu plane so long-press stays the
platform selection gesture (D3). The laws are then engraved as failing-loud guard
tests (D4). Phases sweep by severity: substrate first, then menu-online high
findings, then latent rows, then touch, then guards and the gate.

## Steps







## Parallelization

P01 is the substrate and lands first; its helper is imported by every later phase.
Within P02, steps are per-surface independent and may run in parallel once P01 is
merged; the S03 island predicate must land before S12 (island interiors). P03 steps
are mutually independent and may run in parallel with P02. P04 depends on P01 (guard
routing) but not on P02/P03; S18 must land before S19. P05 is terminal and strictly
after all other phases.


## Verification

- The selection-guard unit matrix passes: guard yields (no preventDefault) on a
  non-collapsed selection intersecting the target; opens the app menu on collapsed,
  absent, or non-intersecting selections.
- The row-selectability sweep assertion passes over every menu-bearing surface: no
  data text node resolves `user-select: none` or sits inside an interactive element
  without an explicit selection re-enable.
- Island predicate tests match the rail and timeline background predicate suites.
- Existing guard suites stay green: `actionCoverage.guard.test.ts`,
  `backgroundContextMenu.render.test.tsx`, `ContextMenuHost` interactive and render
  suites, `commandPalette.guard.test.ts`.
- The full frontend gate exits 0: `just dev lint frontend` plus the complete vitest
  suite.
- The plan is complete when every Step row is closed.
