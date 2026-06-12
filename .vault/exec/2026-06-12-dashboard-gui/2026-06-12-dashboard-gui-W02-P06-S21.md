---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S21'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# render the initial feature constellation with engine-aggregated meta-edges per G3.a and G3.d

## Scope

- `frontend/src/app/stage/Stage.tsx`

## Description

- Add `frontend/src/scene/field/fieldAssembly.ts`: `DashboardField`, the
  assembly composing every W01 part - Pixi application, node sprites,
  tier-treated edges, camera plus pointer gestures, FA2 layout worker,
  anchor driver, visibility trackers, programmatic glyphs, and the
  position cache - into one `SceneFieldRenderer` driven entirely by seam
  commands (set-data, apply-deltas, set-visibility, focus-node,
  set-pinned), with auto-fit following the layout settle until the user's
  first pan/zoom takes the camera.
- Add `frontend/src/scene/sceneMapping.ts` (with tests): the single
  wire-to-seam mapping point, including engine meta-edges to the new
  optional `meta` field on `SceneEdgeData`.
- Extend `frontend/src/scene/field/edgeMeshes.ts` with the meta-edge
  aggregation ribbon treatment: quad geometry, width by log of count per
  G3.d - aggregation with recoverable structure, not bundling.
- Add `frontend/src/app/stage/Stage.tsx`: mounts the field, resolves the
  active scope from the map's default corpus-bearing worktree (until the
  W03 worktree picker), feeds the constellation slice (feature nodes plus
  engine-aggregated meta-edges, never client-flattened) as the set-data
  keyframe, and routes seam events into the shared view state (select,
  open). Replaced the AppShell's placeholder stage.
- Verify live against the mock engine in Chromium: constellation of twelve
  feature silhouettes at far LOD, status rail showing the mock corpus,
  no console errors. Verified the production bundle now emits the
  `fa2.worker` chunk - the foundation rider's worker verification is
  closed.

## Outcome

The product has a living stage: data flows engine → query cache → seam
command → GPU field, interactions flow back through seam events to the
shared selection. Gates green: typecheck, eslint, vitest (115 passed),
prettier; production build passes with the worker chunk emitted.

## Notes

Two locked-seam additions made here, both contract-aligned and flagged for
experience-architect review: `SceneEdgeData.meta` (optional aggregation
payload mirroring contract §4) and the renderer-side `command` member on
`SceneFieldRenderer`. Edge visibility currently snaps on membership change
(topology rebuild) while nodes fade per G3.f; edge fading is a noted
refinement. Pinned nodes are visually fixed by overriding layout output
per frame rather than constraining the FA2 worker - a v1 simplification.

