---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S82'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize comment threads, orphaned-anchor states, edit, resolve, delete, and re-anchor actions

## Scope

- `frontend/src/app/viewer/CommentThreadPanel.tsx`
- `frontend/src/app/viewer/readerComments.ts`

## Description

- Verified `CommentThreadPanel.tsx` resolves its thread, orphaned-anchor, and action
  copy through `useLocalizedMessage` over typed descriptors (38 call sites).
- Verified `readerComments.ts` resolves its action labels through typed message-key
  descriptors (e.g. `documents:actions.openComments` /
  `documents:actions.addComment`).
- Ran the bounded localization scanner against both files and confirmed zero exact
  findings.

## Outcome

Comment-thread presentation and actions render only localized, typed-descriptor copy.

## Notes

Reconciliation pass (bookkeeping only, no code changes). `CommentThreadPanel.tsx`'s
localization landed in bulk commit `5eef2d0599` (later touched by agent-panel work in
`5d77639829`); `readerComments.ts` landed via targeted commit `dfae58b158`
("feat(frontend): localize reader comment actions"). This record retroactively
documents and ticks the plan step; verification was file inspection plus a scoped
scanner run, not a fresh implementation.
