---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S25'
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
     The S25 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Host the two viewers behind the open-in-viewer view-store intent so a selection routes to the markdown reader or the code viewer by node kind and ## Scope

- `frontend/src/app/viewer/ViewerSurface.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Host the two viewers behind the open-in-viewer view-store intent so a selection routes to the markdown reader or the code viewer by node kind

## Scope

- `frontend/src/app/viewer/ViewerSurface.tsx`

## Description

- Build the ViewerSurface host reading the open-in-viewer viewerTarget from the view store, driving the single content query keyed on the target id + the active scope, and routing the resulting content view to the markdown reader or the code viewer by the target's surface.
- Add a close affordance (Lucide X) clearing the target; the host fetches nothing itself and reads no raw tiers block.

## Outcome

A selection routes to the correct viewer by node kind through the open-in-viewer intent; the host is dumb chrome over the stores content query.

## Notes

None.
