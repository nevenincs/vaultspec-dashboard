---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S21'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Surface the view-edit toggle and close-editor accelerator hints on the segmented control

## Scope

- `frontend/src/app/viewer/DocChrome.tsx`

## Description

- Add an accelerator-hint cluster to the doc chrome: the view/edit toggle chord and the close-editor chord render as Kbd chips beside the segmented toggle.
- Derive the chords from the editor keybinding catalog with the live override applied, never a hand-typed string, so a user's rebind is reflected and the hint cannot drift from the live binding.
- Mirror the toggle chord onto both segments' native tooltips for redundancy.
- Add a render test pinning non-macOS so the hints assert as the literal `Ctrl E` / `Ctrl Alt W` keycaps.

## Outcome

Reading mode now surfaces its keyboard contract on the toggle. `DocChrome` stays prop-driven app chrome (no wire state, no fetch); the accelerator read is a pure platform-registry lookup. Render test green.

Modified files:

- `frontend/src/app/viewer/DocChrome.tsx`
- `frontend/src/app/viewer/DocChrome.render.test.tsx` (new)

## Notes

The catalog builder is used rather than a live registry lookup so the hint is deterministic at first paint and in tests (the registry registers editor bindings in a mount effect that would not have run at hint render time).
