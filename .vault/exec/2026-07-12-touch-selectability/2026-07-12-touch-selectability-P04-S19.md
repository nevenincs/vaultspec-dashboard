---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S19'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

# Mount the disclosure affordance on compact menu-bearing surfaces and confirm Android long-press routes through the selection guard

## Scope

- `frontend/src/app/shell/`

## Description

- Add an optional trailing slot to `DocChrome` and mount `RowMenuDisclosure` there from `MarkdownDocView` view mode with the same vault-doc entity the right-click path opens
- Mount `RowMenuDisclosure` beside every vault tree leaf row in `TreeBrowser` (sibling of the row button, never nested inside it)

## Outcome

Compact and any coarse-pointer device now reach the resolver menu by explicit tap on the two primary menu-bearing surfaces (tree rows, the open document), while Android long-press `contextmenu` rides the P01 guard. The affordance renders null on fine pointers so desktop DOM is unchanged. Viewer, left, and shell suites pass (181 tests) and typecheck is clean. Deviation: the true mount points are `TreeBrowser` and the viewer chrome rather than the `app/shell/` scope literal - the compact shell renders both, and mounting at the shared component covers desktop touch for free.

## Notes

Review revision (HIGH finding): the initial mount covered only tree leaf rows and
the document chrome. The disclosure now rides EVERY menu-online surface - tree
folder rows and section headers (via a new opt-in `headerTrailingSibling` slot on
`FoldSection`/`RailSection` so the control is a sibling, never button-in-button),
the worktree row, code tree rows, the inspector node header and edge rows, commit
and pull-request rows, the doc tab, and the island header - each passing the exact
entity its right-click path opens. A D4 sweep test now fails loudly if a surface
pairs `onContextMenu` + `openContextMenu` without the disclosure.
