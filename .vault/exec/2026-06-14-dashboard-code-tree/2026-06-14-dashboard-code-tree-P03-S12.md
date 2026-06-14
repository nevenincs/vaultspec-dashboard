---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S12'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-code-tree with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S12 and 2026-06-14-dashboard-code-tree-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Render a quiet absent-interlink state for files with no graph node and ## Scope

- `frontend/src/app/left/CodeTree.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Render a quiet absent-interlink state for files with no graph node

## Scope

- `frontend/src/app/left/CodeTree.tsx`

## Description

- Render a quiet absent-interlink state for files with no graph node: a file row shows a subtle right-aligned linkage marker ONLY when its `code:<path>` node id is present in the host-supplied `linkedNodeIds` set; otherwise it renders the quiet absent state (no marker), still listed and selectable for navigation, never an error.
- Default `linkedNodeIds` to empty (the honest baseline: every file reads as the absent state until the IA host supplies the set).

## Outcome

- COMMITTED: the absent/linked rendering lives in the committed `frontend/src/app/left/CodeTree.tsx` (`data-code-linked` marks linked rows; absent rows carry nothing).
- Verified: the render test asserts a file in the linkage set shows the marker while a file outside it renders the quiet absent state and remains a clickable button.

## Notes

- The linkage set is a component prop rather than a rail-local graph fetch: reading the whole graph from the left rail to decide per-file linkage would breach `graph-queries-are-bounded-by-default` and `dashboard-layer-ownership`. The host (Executor 3) supplies the set from whatever bounded graph context it already holds; absent the set, the honest default is "no linkage known", i.e. the quiet absent state for every file — which is exactly the P03.S12 state.
