---
generated: true
tags:
  - '#index'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - '[[2026-07-12-touch-selectability-P01-S01]]'
  - '[[2026-07-12-touch-selectability-P01-S02]]'
  - '[[2026-07-12-touch-selectability-P01-S03]]'
  - '[[2026-07-12-touch-selectability-P02-S04]]'
  - '[[2026-07-12-touch-selectability-P02-S05]]'
  - '[[2026-07-12-touch-selectability-P02-S06]]'
  - '[[2026-07-12-touch-selectability-P02-S07]]'
  - '[[2026-07-12-touch-selectability-P02-S08]]'
  - '[[2026-07-12-touch-selectability-P02-S09]]'
  - '[[2026-07-12-touch-selectability-P02-S10]]'
  - '[[2026-07-12-touch-selectability-P02-S11]]'
  - '[[2026-07-12-touch-selectability-P02-S12]]'
  - '[[2026-07-12-touch-selectability-P03-S13]]'
  - '[[2026-07-12-touch-selectability-P03-S14]]'
  - '[[2026-07-12-touch-selectability-P03-S15]]'
  - '[[2026-07-12-touch-selectability-P03-S16]]'
  - '[[2026-07-12-touch-selectability-P03-S17]]'
  - '[[2026-07-12-touch-selectability-P04-S18]]'
  - '[[2026-07-12-touch-selectability-P04-S19]]'
  - '[[2026-07-12-touch-selectability-P04-S20]]'
  - '[[2026-07-12-touch-selectability-P05-S21]]'
  - '[[2026-07-12-touch-selectability-P05-S22]]'
  - '[[2026-07-12-touch-selectability-adr]]'
  - '[[2026-07-12-touch-selectability-audit]]'
  - '[[2026-07-12-touch-selectability-plan]]'
---

# `touch-selectability` feature index

Auto-generated index of all documents tagged with `#touch-selectability`.

## Documents

### adr

- `2026-07-12-touch-selectability-adr` - `touch-selectability` adr: `text selection and touch interactivity standard: selection yields to no one` | (**status:** `accepted`)

### audit

- `2026-07-12-touch-selectability-audit` - `touch-selectability` audit: `text selection and touch interactivity across every frontend module`

### exec

- `2026-07-12-touch-selectability-P01-S01` - Author the shared selection-guard helper that yields the app context menu to a live non-collapsed text selection intersecting the target, plus its yield/open unit matrix
- `2026-07-12-touch-selectability-P01-S02` - Route the background empty-space handler through the same selection-guard clause so future text-bearing background surfaces inherit it
- `2026-07-12-touch-selectability-P01-S03` - Scope the island context-menu handler with a target predicate like the rail and timeline predicates so nested data targets stop being blanketed
- `2026-07-12-touch-selectability-P02-S04` - Route the whole-viewer vault-doc context-menu hijack through the selection guard so selected prose keeps its native menu
- `2026-07-12-touch-selectability-P02-S05` - Render wiki-links and Related-footer stems as selectable anchor-shaped elements with unchanged activation so prose ranges stay contiguous
- `2026-07-12-touch-selectability-P02-S06` - Re-enable text selection on vault tree row data text and route the row menus through the selection guard
- `2026-07-12-touch-selectability-P02-S07` - Re-enable text selection on code tree row path text and route the code-file menu through the selection guard
- `2026-07-12-touch-selectability-P02-S08` - Re-enable text selection on worktree, project, and recent row data text and route the worktree menu through the selection guard
- `2026-07-12-touch-selectability-P02-S09` - Re-enable selection on inspector node title, property values, and edge row labels and guard the node and edge menu opens
- `2026-07-12-touch-selectability-P02-S10` - Re-enable selection on commit hash, subject, and age text and guard the commit and pull-request row menu opens
- `2026-07-12-touch-selectability-P02-S11` - Scope doc tab title selection to the title span so tab dragging survives, and guard the doc-tab menu open
- `2026-07-12-touch-selectability-P02-S12` - Re-enable selection on island interior chips and step titles beneath the newly scoped island menu
- `2026-07-12-touch-selectability-P03-S13` - Re-enable selection on command, document-search, and semantic-search result row data text across the palette surfaces
- `2026-07-12-touch-selectability-P03-S14` - Re-enable selection on combobox and feature-suggestion option data text in the viewer and left-rail pickers
- `2026-07-12-touch-selectability-P03-S15` - Carve the computed date-range readout out of the timeline scrubber selection suppression
- `2026-07-12-touch-selectability-P03-S16` - Re-enable selection on plan pill titles, changed-file names, and plan-step headings in the latent right-rail rows
- `2026-07-12-touch-selectability-P03-S17` - Re-enable selection on workspace switcher and project navigator row names on the compact shell
- `2026-07-12-touch-selectability-P04-S18` - Add the coarse-pointer per-row menu disclosure affordance over the openContextMenu seam for menu-bearing rows
- `2026-07-12-touch-selectability-P04-S19` - Mount the disclosure affordance on compact menu-bearing surfaces and confirm Android long-press routes through the selection guard
- `2026-07-12-touch-selectability-P04-S20` - Yield the compact reader edge-swipe recognizer while a text selection is active
- `2026-07-12-touch-selectability-P05-S21` - Author the row-selectability sweep assertion over menu-bearing surfaces and the island predicate suite alongside the guard matrix
- `2026-07-12-touch-selectability-P05-S22` - Run the full frontend lint gate and the complete vitest suite and reconcile any regression to green

### plan

- `2026-07-12-touch-selectability-plan` - `touch-selectability` plan
