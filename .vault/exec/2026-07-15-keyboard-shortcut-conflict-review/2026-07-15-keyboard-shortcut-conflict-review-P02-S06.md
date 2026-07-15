---
tags:
  - '#exec'
  - '#keyboard-shortcut-conflict-review'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S06'
related:
  - "[[2026-07-15-keyboard-shortcut-conflict-review-plan]]"
---




# Re-chord the search palette Mod+P to Mod+Shift+P with a reservation comment, updating palette and localization tests (D5)

## Scope

- `frontend/src/stores/view/commandPalette.ts`

## Description

- Re-chord the search palette off Mod+P; the review rounds drove the final chord to Mod+Alt+S (Mod+Shift+P rejected: Firefox New Private Window; Mod+Alt+P rejected: taken by project browse); update the palette localization test and inline notes

## Outcome

Part of the campaign's real behavior changes (ADR D5, twice amended in review); release-note worthy. The review rounds also re-chorded document-search (Mod+Shift+O -> Mod+Alt+F; Chrome Bookmark Manager / Firefox Library) and the editor draft-diff (Mod+Shift+D -> Mod+Alt+D -> Mod+Alt+G; Chrome bookmark-all-tabs, then macOS Show/Hide Dock).

## Notes
