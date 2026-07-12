---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S28'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Delete the unmounted Inspector, NowStrip, and DocHeader components together with their render tests

## Scope

- `frontend/src/app/right`

## Description

- Verified zero live component imports for `Inspector`, `NowStrip`, and `DocHeader` across `frontend/src` (excluding their own files and render tests); all external matches were store-layer derivation functions, comments, or a local inline `DocHeaderBlock` helper in the viewer.
- Removed `"right/Inspector.tsx"` from the `mustCarrySelectText` list in `guardedContextMenu.test.ts` to prevent a live `fs.readFileSync` crash after deletion; no other registry or barrel-export references existed.
- Deleted `Inspector.tsx`, `NowStrip.tsx`, `DocHeader.tsx`, `Inspector.render.test.tsx`, `NowStrip.test.tsx`, and `DocHeader.render.test.tsx` from `frontend/src/app/right`.
- Confirmed `npx tsc --noEmit` exits clean.
- Ran `npx vitest run src/app/right`: 6 test files, 64 tests passed.
- Ran `npx vitest run src/app/menus/guardedContextMenu.test.ts`: 1 file, 15 tests passed.

## Outcome

All six files deleted. TypeScript and the targeted vitest suites exit clean. The store-layer slices (`inspector.ts`, `inspectorExpansion.ts`, `nowStrip.ts`) remain intact — they are not components and remain referenced by `rail.test.ts` derivation tests.

## Notes

The `guardedContextMenu.test.ts` guard does a live filesystem read on each entry in `mustCarrySelectText`; the `Inspector.tsx` entry had to be removed alongside the file to prevent a test crash. This is the only ancillary edit beyond the six deletions.
