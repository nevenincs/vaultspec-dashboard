---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S23'
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
     The S23 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Virtualize the line list so a large capped file scrolls cheaply, with no editing affordances and ## Scope

- `frontend/src/app/viewer/CodeViewer.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Virtualize the line list so a large capped file scrolls cheaply, with no editing affordances

## Scope

- `frontend/src/app/viewer/CodeViewer.tsx`

## Description

- Virtualize the line list with a self-contained fixed-row-height windowed renderer: compute the visible line range from scrollTop + a measured viewport height (ResizeObserver), render only that window (plus overscan) absolutely positioned within a full-height spacer, with a sticky line-number gutter.
- No editing affordances — the viewer is display-only.

## Outcome

A large (byte-capped) file scrolls cheaply rendering only the visible window; the component test confirms no textbox (display-only).

## Notes

No virtualization library exists in the codebase; a lightweight windowed renderer was implemented in-component rather than adding a dependency, consistent with the byte-capped file bound.
