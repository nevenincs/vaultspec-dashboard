---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S09'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# mount the PixiJS application behind the SceneController lifecycle of mount, resize, destroy per G6.b

## Scope

- `frontend/src/scene/field/pixiField.ts`

## Description

- Add `frontend/src/scene/field/pixiField.ts`: `PixiField` owning the Pixi
  v8 `Application` (WebGL preference, paper-warm background pending the S47
  token layer) and the world container the camera and field layers parent
  under.
- Serialize Pixi's async init against destroy so a fast mount/destroy cycle
  can never leak an `Application`; queue a pre-mount resize and replay it
  once live; make destroy idempotent.
- Declare the `SceneFieldRenderer` interface seam-side in
  `frontend/src/scene/sceneController.ts` and inject it via the
  `SceneController` constructor; mount/resize/destroy now delegate. The
  locked public surface is unchanged - injection is an implementation
  detail behind it, and the sigma.js fallback would implement the same
  interface.
- Extend `frontend/src/scene/sceneController.test.ts` with a fake-field
  delegation test (Pixi cannot init in the node test environment).

## Outcome

The renderer mounts behind the locked seam lifecycle per G6.b. Gates green:
typecheck, eslint, vitest (39 passed), prettier.

## Notes

Browser-level mount verification (a live canvas in the host) lands with the
S21 stage component; until then the only DOM-level exercise of the field is
the spike harness, which constructs Pixi directly by design.

