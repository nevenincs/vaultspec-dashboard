---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S18'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace touch-selectability with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S18 and 2026-07-12-touch-selectability-plan placeholders are machine-filled by
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
     The Add the coarse-pointer per-row menu disclosure affordance over the openContextMenu seam for menu-bearing rows and ## Scope

- `frontend/src/app/chrome/RowMenuDisclosure.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the coarse-pointer per-row menu disclosure affordance over the openContextMenu seam for menu-bearing rows

## Scope

- `frontend/src/app/chrome/RowMenuDisclosure.tsx`

## Description

- Author `RowMenuDisclosure` in `frontend/src/app/chrome/RowMenuDisclosure.tsx`: a coarse-pointer-only kit `IconButton` that opens the row's resolver menu through the existing `openContextMenu` seam, anchored at the control
- Author `usePointerCoarse`, a `matchMedia`-backed primitive-snapshot signal mirroring the `viewportClass` store pattern

## Outcome

The deliberate touch entry to the menu plane exists as one shared chrome control; it renders nothing on fine-pointer devices and is exempt from the selection guard because a tap on it is always an explicit menu request. Mounting on compact surfaces lands in the next step.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
