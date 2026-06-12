---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S27'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement node pinning, layout-fixed and always-labelled, with client-side persistence per G5.d

## Scope

- `frontend/src/stores/view/pins.ts`

## Description

- Add `frontend/src/stores/view/pins.ts`: the pin store (toggle, membership,
  scope key) with client-side persistence per workspace + scope in web
  storage - pure, tested load/save helpers, corrupt blobs self-heal, full
  storage degrades to unsaved pins, never a crash. The engine holds no
  preference store (G5.d).
- Bind pins to the seam: `pin` events toggle, membership changes push the
  locked `set-pinned` command; the field already layout-fixes pinned nodes
  (position override per frame) and always-labels them (pinned ids are the
  field's focused set, which forces full anatomy at any zoom).
- Wire the stage: scope changes load that scope's pins; binding mounts with
  the scene.
- Add `frontend/src/stores/view/pins.test.ts` covering persistence
  round-trip, scope isolation, corrupt-blob healing, and the event/command
  round-trip through a captured scene.

## Outcome

Pins survive reloads per workspace + scope, fix layout, and keep labels.
Phase W02.P06 (stage interactions) is complete. Gates green: typecheck,
eslint, vitest (132 passed), prettier; production build passes.

## Notes

The pin affordance is currently the seam event (field context paths) plus
the store API the palette (S43) and inspector (S42) will call; a dedicated
on-stage pin button rides the island chrome later if wanted.

