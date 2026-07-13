---
tags:
  - '#exec'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-12'
related:
  - "[[2026-07-11-universal-data-loading-plan]]"
---

# `universal-data-loading` `P02` summary

## Description

S05-S08 complete. Rendered the activity truth once per shell branch (ADR D2): the dumb kit `ActivityIndicator` (slim fixed top pulse bar, determinate rows chip, static sr-only live region, token-only), the one connected `DataActivityIndicator` mount in both AppShell branches, and the canvas held-slice refetch affordance - `GraphSliceAvailability.refreshing` (fetching behind held data) surfacing as the lowest-precedence `Refreshing view...` corner banner that never blanks the field. Overlay suite extended to 29 green tests including precedence against the existing designed-state table.

- Created: `frontend/src/app/kit/ActivityIndicator.tsx`, `frontend/src/app/chrome/DataActivityIndicator.tsx`
- Modified: `frontend/src/app/AppShell.tsx`, `frontend/src/stores/server/queries.ts`, `frontend/src/app/stage/CanvasStateOverlay.tsx`, `frontend/src/app/stage/CanvasStateOverlay.render.test.tsx`

Note: the compact mount lives in the AppShell compact branch rather than inside `MobileTopBar` (the indicator is position-fixed, so the D2 one-mount-per-branch invariant holds; MobileTopBar stays dumb chrome) - reviewed and accepted as intent-honoring drift from the S06 row wording.
