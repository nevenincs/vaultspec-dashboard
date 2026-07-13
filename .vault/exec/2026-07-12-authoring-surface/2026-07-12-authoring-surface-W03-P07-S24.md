---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S24'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Add the vault-mode Plus create button to the browser-region header via the shared new-document action

## Scope

- `frontend/src/app/left/BrowserRegion.tsx`

## Description

- Add a Plus icon button to the browser-region header beside the tree-options button, aria-labelled and dispatching the shared new-document action.
- Gate it to vault mode only — the Files tree lists source, not authored documents.
- Add a render test (no-scope seeded client) asserting the Plus renders and dispatches in vault mode and withdraws in code mode.

## Outcome

Create is now always-visible discovery in the rail header, vault-mode only, through the one shared descriptor. Render test green.

Modified files:

- `frontend/src/app/left/BrowserRegion.tsx`
- `frontend/src/app/left/BrowserRegion.render.test.tsx` (new)

## Notes

None.
