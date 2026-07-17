---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S198'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate document chrome, properties, and related-document tests through production catalogs

## Scope

- `frontend/src/app/viewer/DocChrome.render.test.tsx`
- `frontend/src/app/viewer/PropertiesPopover.render.test.tsx`
- `frontend/src/app/viewer/RelatedDocPicker.render.test.tsx`

## Description

- `RelatedDocPicker.render.test.tsx` had a stale-casing defect (3 sites): the
  combobox accessible name `"link a related document"` and the remove-button name
  `"remove alpha-plan"` (both lowercase) versus the catalog's sentence-case
  `"Link a related document"` / `"Remove alpha-plan"`. The coding lane
  (opus-l10n) updated all three lookups.
- `DocChrome.render.test.tsx` and `PropertiesPopover.render.test.tsx` were
  already correct (verified independently against production catalogs when
  `W05.P15.S86` was ticked).

## Outcome

All three files assert against the actual sentence-case catalog output; none
mocks or stubs the localization runtime.

## Notes

Same stale-casing defect class as `W03.P08.S174`/`W05.P15.S89`. The component
under test (`RelatedDocPicker.tsx`, `W05.P15.S196`) was never broken. Fixed by
opus-l10n, independently reverified: reran `RelatedDocPicker.render.test.tsx`
live — part of the 78/78 passing set for this batch. Landed at commit
`578b4e5454` ("batch #2 test-only stale assertions to typed/sentence-case output
... dual-verified"). Not a fresh implementation on my part.
