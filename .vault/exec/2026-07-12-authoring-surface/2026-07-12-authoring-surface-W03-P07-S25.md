---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S25'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Add the Features-section scoped Plus that opens the create dialog focused on the feature field

## Scope

- `frontend/src/app/left/TreeBrowser.tsx`

## Description

- Add a one-shot feature-focus request to the create-document chrome store, set by an option on the shared open-dialog seam and consumed once so a later ordinary open cannot steal focus.
- Extend the shared new-document action to carry that focus option through unchanged under the same id.
- Add an optional scoped-create prop to the vault tree's section component; render a Plus in the Features section header as a sibling of the menu disclosure (so it never toggles the fold), dispatching the new-document action with the focus request.
- Wire the create dialog to move focus to the feature combobox when the focus request is set on open.

## Outcome

The Features section header now offers a scoped create that lands the caret on the feature field, all through the one shared descriptor. The focus behaviour is proven by a store-intent unit test plus the dialog render test (S27).

Modified files:

- `frontend/src/stores/view/createDocChrome.ts`
- `frontend/src/stores/view/leftRailKeybindings.ts`
- `frontend/src/app/left/TreeBrowser.tsx`

## Notes

The focus intent is a store flag consumed once, not a bespoke DOM poke; the dialog focuses the combobox input via a scoped ref query on open. The Documents section deliberately does not carry the scoped-create prop (only Features does).
