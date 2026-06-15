---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S43'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# build the command palette fronting navigation, lenses, and ops verbs on the committed primitives per G2.a and G5.c

## Scope

- `frontend/src/app/palette/CommandPalette.tsx`

## Description

- Add `frontend/src/app/palette/CommandPalette.tsx`: Ctrl/Cmd-K toggles
  the modal; arrow keys walk, Enter runs, Escape closes; commands filter
  on the typed query.
- Commands assemble from committed primitives only (pure, tested
  `buildCommands`): navigation to features from the engine-enumerated
  vocabulary (shared selection focuses the stage), lenses from the S31
  store (apply, plus save-current-as when a name is typed), and the R1 ops
  whitelist - ops verbs arm on first Enter and run on the second, and
  disappear entirely in time-travel mode (the G4.b gate applies
  everywhere).
- Mounted at the shell root above all regions.
- Add `frontend/src/app/palette/CommandPalette.test.ts` covering command
  assembly, confirm flags, save-lens gating, wired actions, and filtering.

## Outcome

The universal verb surface exists as the cheap escape hatch; nothing
exists only in the palette. Gates green: typecheck, eslint, vitest (188
passed), prettier.

## Notes

Search-from-palette routes to the S44 rail tab rather than duplicating the
search surface inside the modal.

