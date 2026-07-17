---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S89'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate Markdown and code reader tests through production catalogs

## Scope

- `frontend/src/app/viewer/MarkdownReader.test.tsx`
- `frontend/src/app/viewer/CodeViewer.test.tsx`
- `frontend/src/app/viewer/MarkdownDocView.render.test.tsx`

## Description

- `MarkdownDocView.render.test.tsx` had a stale-casing defect (5 sites): it called
  `screen.getByLabelText("document body editor")` (lowercase) where the catalog
  resolves `"Document body editor"` (sentence case,
  `documents:accessibility.documentBodyEditor`). The coding lane (opus-l10n)
  updated all 5 lookups.
- `MarkdownReader.test.tsx` and `CodeViewer.test.tsx` were already correct
  (verified independently against production catalogs when `W05.P15.S85`/`S242`
  were ticked).

## Outcome

All three files assert against the actual sentence-case catalog output; none
mocks or stubs the localization runtime.

## Notes

Same stale-casing defect class as `W03.P08.S174`/`W05.P15.S198`. The component
under test (`MarkdownDocView.tsx`, `W05.P15.S88`) was never broken. Fixed by
opus-l10n, independently reverified: reran `MarkdownDocView.render.test.tsx` live
— part of the 78/78 passing set for this batch. Landed at commit `578b4e5454`
("batch #2 test-only stale assertions to typed/sentence-case output ...
dual-verified"). Not a fresh implementation on my part.
