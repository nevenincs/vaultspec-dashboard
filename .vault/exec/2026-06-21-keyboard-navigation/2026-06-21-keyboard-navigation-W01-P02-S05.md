---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-21'
modified: '2026-06-21'
step_id: 'S05'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---




# Add the visually-hidden skip-to-content link as first tab stop and place initial focus on load so a visible focused element always exists

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Added a visually-hidden ("sr-only", visible on focus) skip-to-content link as the first child of the shell root; activating it focuses the stage `<main>`.
- Gave `<main>` `id="stage"`, `tabIndex={-1}`, and `data-focus-region="stage"`; added a mount effect placing initial focus on it so the page never loads with focus on `<body>`.
- Anchored the four region containers with `data-focus-region` (left-rail content, stage main, right-rail activity, timeline footer) and mounted `useRegionCycleKeybindings()`.

## Outcome

- Live-verified: on cold load `document.activeElement` is `MAIN#stage` (not body); the skip link is the first focusable in DOM, focusable, and Enter on it moves focus to the stage. prettier/eslint/tsc clean.

## Notes

- The dev "degrade" crash-bar button is now the SECOND focusable (after the skip link); removing it from the production tab ring is W01.P03.S07.
