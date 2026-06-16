---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S11'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace review-rail-viewers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S11 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Add a view-store open-in-viewer intent carrying the target node id and the active viewer surface and ## Scope

- `frontend/src/stores/view/viewStore.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a view-store open-in-viewer intent carrying the target node id and the active viewer surface

## Scope

- `frontend/src/stores/view/viewStore.ts`

## Description

- Add the `ViewerSurface` and `ViewerTarget` types and a `viewerTarget` view-store slice carrying the target node id plus the active viewer surface (markdown/code).
- Add `openInViewer(nodeId, surface)` and `closeViewer()` actions, distinct from `select`/`openNode`, so a cross-link can both select and open.
- Reset `viewerTarget` to null on both the scope swap and the workspace swap so a stale viewer does not survive a corpus change.

## Outcome

The open-in-viewer intent is owned in the view store; the viewer host reads it and the content query keyed on the id renders the document/file.

## Notes

None.
