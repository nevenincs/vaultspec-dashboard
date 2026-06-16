---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S17'
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
     The S17 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Build the MarkdownReader component rendering GFM including plan task-list checkboxes, themed entirely from the existing --color tokens and ## Scope

- `frontend/src/app/viewer/MarkdownReader.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Build the MarkdownReader component rendering GFM including plan task-list checkboxes, themed entirely from the existing --color tokens

## Scope

- `frontend/src/app/viewer/MarkdownReader.tsx`

## Description

- Build the MarkdownReader rendering GFM through react-markdown + remark-gfm, including plan task-list checkboxes, themed entirely from the existing color tokens (no new color).
- Preserve the wiki-link sentinel scheme through a custom urlTransform so react-markdown's sanitizer does not strip it; route external links to a new tab.

## Outcome

The reader renders GFM bodies and plan task lists; the component test confirms task-list checkboxes render with their checked state.

## Notes

None.
