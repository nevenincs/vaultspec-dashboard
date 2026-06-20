---
tags:
  - '#exec'
  - '#dashboard-state-centralization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S42'
related:
  - "[[2026-06-17-dashboard-state-centralization-plan]]"
---

# Add browser integration coverage for graph selection propagating to timeline and right rail

## Scope

- `frontend/src/app/stage/Stage.tsx`
- `frontend/src/app/stage/Stage.render.test.tsx`
- `frontend/src/app/timeline/eventSelection.test.ts`
- `frontend/src/app/timeline/Playhead.tsx`
- `frontend/src/stores/view/selection.ts`
- Selection ownership comments in scene/right-rail files.

## Description

- Extracted the production scene `select` event bridge into
  `useSceneSelectionBridge`, so the graph-selection seam can be tested without
  mounting the WebGL renderer in happy-dom.
- Added live-engine/TanStack coverage that emits a real `SceneController`
  `select` event and verifies the canonical backend `selected_ids` state is
  observed by a right-rail-style dashboard-state subscriber.
- Added matching live coverage for timeline mark selection through
  `handleNodeClick`, verifying it writes the same canonical `selected_ids` path
  and does not mirror node selection into `viewStore`.
- Rewrote stale timeline selection tests and comments so node selection is
  described as backend dashboard-state, while viewStore remains local metadata
  only for event/edge selection.

## Outcome

- Targeted selection test run passed: `npx vitest run
  src/app/stage/Stage.render.test.tsx src/app/timeline/eventSelection.test.ts
  src/stores/view/selection.test.ts src/stores/view/selection.scene-origin.test.ts
  src/scene/sceneController.test.ts`.
- Result: 5 test files, 24 tests passed, 0 failed.
- Frontend typecheck passed: `npm run typecheck`.
- Scoped ESLint and Prettier checks passed for the touched files.
- Stale local-node-selection wording scan returned no matches.

## Notes

- A GPT-5.5 high review advised against mounting the full WebGL Stage in
  happy-dom; S42 follows that by testing the production selection bridge without
  faking the renderer.
- Vitest emitted the existing Node deprecation warning about child-process shell
  args; the run exited 0.
