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
