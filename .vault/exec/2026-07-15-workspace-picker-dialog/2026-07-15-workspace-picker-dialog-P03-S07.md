---
tags:
  - '#exec'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S07'
related:
  - "[[2026-07-15-workspace-picker-dialog-plan]]"
---




# Rebuild the folder browser with select-then-confirm rows, clickable breadcrumbs, level filter box, hidden toggle with de-emphasized rows, registered markers, and preserved keyboard focus across level changes, with pure-resolver tests

## Scope

- `frontend/src/app/left/FolderBrowser.tsx`

## Description

- Rebuild the browser pane as a presentational component over the dialog-owned level query (the pane never fetches), replacing the wired one-level list
- Replace the `..` row and header-path with the kit `Breadcrumb` trail derived from the served path (`deriveBreadcrumbs`), drive segments navigating through their root form
- Implement select-then-confirm (ADR D1): click/arrow selects, double-click / Enter / ArrowRight navigates, ArrowLeft/Backspace climbs to the parent crumb; consumed keys stop propagating (actions-keymap rule)
- Preserve keyboard focus across level changes: a list-originated navigation refocuses the first row when the level lands (the old pane dropped focus to body on every drill)
- Add the kit `SearchField` level filter and the kit `Switch` hidden toggle; hidden and registered rows render de-emphasized, registered rows are marked "Already added" and never selectable
- Localize every string through message descriptors under `projects:folderBrowser` (catalog, policy roles, expected-keys list, fr/ar test resources all updated); folder names stay data, interpolated into aria copy
- Rewrite the pure-resolver tests for the new shape (badges precedence, breadcrumbs, filtered-vs-empty copy, truncation) plus rendered localization tests

## Outcome

The browser pane matches the binding Figma frames and the ADR D1/D2 interaction contract, with all narrowing engine-side.

## Notes

- New non-copy scanner findings (enum props in JSX expressions) were allowlisted via the localization scanner's content-addressed allowlist, the sanctioned mechanism the migrated surfaces already use.
