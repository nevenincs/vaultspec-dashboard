---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S31'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Resolve context-menu feedback at the React boundary

## Scope

- `frontend/src/app/menu/ContextMenuHost.tsx`
- `frontend/src/app/menu/ContextMenuHost.render.test.tsx`
- `frontend/src/app/menu/seamTransit.test.tsx`

## Description

- Resolve persistent feedback descriptors only during React render.
- Preserve polite atomic live-region behavior and repeated announcements.
- Prove locale reactivity without mutating feedback condition or token state.
- Replace ambiguous and spy-based seam tests with semantic queries and a real registered handler.

## Outcome

The context-menu boundary now resolves labels, reasons, confirmations, accelerators, live messages, and persistent action feedback without caching translated strings or exposing internal fallback values.

## Verification

- `just dev lint frontend`
- Full menu and feedback suites, 127 tests
- Independent Terra review approved with no findings

## Notes

This step landed atomically with S39 so the persistent live region never entered a mixed string and descriptor state.
