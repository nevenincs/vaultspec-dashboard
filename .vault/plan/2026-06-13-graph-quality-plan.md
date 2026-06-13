---
tags:
  - '#plan'
  - '#graph-quality'
date: '2026-06-13'
modified: '2026-06-13'
tier: L2
related:
  - '[[2026-06-13-dashboard-optimization-adr]]'
  - '[[2026-06-13-constellation-live-delta-adr]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #plan) and one feature tag.
     Replace graph-quality with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     tier is mandatory for new plans. Allowed: L1, L2, L3, L4.
     L1 = Steps only. L2 = Phases above Steps. L3 = Waves above
     Phases above Steps. L4 = Epic above Waves above Phases above
     Steps; PM association required. Pre-existing plans without this
     field default to L2.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'. The related field
     carries the AUTHORIZING documents (ADR, research, reference, prior
     plan) for every Step in this plan; Steps inherit this chain;
     per-row reference footers do not exist.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->


<!-- HIERARCHY AND TIERS:
     Epic > Wave > Phase > Step. Step is the canonical leaf-row
     noun. Execution Record artifact: <Step Record>.
     Tier is declared in frontmatter as tier: L1/L2/L3/L4
     (mandatory for new plans; pre-existing plans without the
     field default to L2 and the writer adds the field on first
     edit). The tier selects containers:
       L1 = Steps only.
       L2 = Phases above Steps.
       L3 = Waves above Phases above Steps.
       L4 = Epic above Waves above Phases above Steps; MUST declare
            a project-management association in the Epic intent
            block prose.
     Selection is by complexity criteria, not container counting.
     Writer never invents containers to qualify a tier. -->

<!-- IDENTIFIERS AND ROW CONTRACT:
     S##, P##, W## are flat, per-document, append-only, immutable.
     Promotion adds containers without renumbering. Gaps are not
     reused.
     Display paths are computed from current grouping:
       Step path:    L1 S##   L2 P##.S##   L3/L4 W##.P##.S##
       Phase heading:        L2 P##       L3/L4 W##.P##
       Wave heading:                      L3/L4 W##
     Row format:
       - [ ] `<display-path>` - imperative-verb action; `path/to/file`.
     Two-state checkboxes only ([ ] open, [x] closed). No per-row
     reference footers; wiki-links and markdown links are forbidden
     in plan body. Authorizing documents go in the plan's `related:`
     frontmatter once.
     ASCII spaced hyphens everywhere; em-dash (U+2014) and en-dash
     (U+2013) are forbidden. Step rows within a Phase are
     contiguous. -->

<!-- NO COMPRESSION:
     N self-similar actions = N rows. Never collapse into "for each
     X, do Y" / "across all callers, do Z" / "in every module,
     replace W". The rule applies at every tier including L1. -->

<!-- VAULTSPEC-CORE VAULT PLAN CLI:
     The `vaultspec-core vault plan` CLI is the canonical surface for
     structural manipulation of this plan document. Writers and
     executors MUST use `vaultspec-core vault plan step add/insert/move/
     remove/check/uncheck/toggle/edit`,
     `vaultspec-core vault plan phase add/move/remove/edit`,
     `vaultspec-core vault plan wave add/move/remove/edit`,
     `vaultspec-core vault plan epic intent`, and
     `vaultspec-core vault plan tier promote/demote` for every
     identifier-affecting change rather than hand-editing the row
     grammar. Hand edits are tolerated by the parser but flagged by
     `vaultspec-core vault plan check`; canonical-identifier preservation is
     guaranteed only when the CLI performs the mutation. See the
     CLI ADR (2026-05-06-plan-hardening-adr) for the full
     subcommand surface. -->

# `graph-quality` plan

### Phase `P01` - Layout algorithm controls

Expose FA2 gravity/repulsion/link-distance/decay tuning and a circular-radial alternative arrangement through a SceneController API; the FA2 worker gains a params message, FieldLayout gains setParams/setMode, and two new SceneCommand kinds route from the app chrome to the field renderer.

- [ ] `P01.S01` - Add a params message kind to the FA2 worker so gravity, scalingRatio, edgeWeightInfluence, and slowDown are tunable at runtime without restarting; `frontend/src/scene/field/fa2.worker.ts`.
- [ ] `P01.S02` - Add setParams and setMode to FieldLayout, two new SceneCommand kinds (set-layout-params, set-layout-mode) routed in DashboardField, and getLayoutState as a synchronous getter on SceneController; `frontend/src/scene/field/layoutWorker.ts, frontend/src/scene/field/fieldAssembly.ts, frontend/src/scene/sceneController.ts`.
- [ ] `P01.S03` - Implement a CircularLayout strategy that arranges N nodes on a circle of radius proportional to sqrt(N) and wire it as the alternate mode behind set-layout-mode; `frontend/src/scene/field/circularLayout.ts, frontend/src/scene/field/layoutWorker.ts`.
- [ ] `P01.S04` - Add a layout-changed SceneEvent emitted by SceneController when mode or params change so the app layer can re-render the controls panel without polling; `frontend/src/scene/sceneController.ts, frontend/src/scene/field/fieldAssembly.ts`.

### Phase `P02` - Minimap

A downscaled node-position overlay canvas with a live viewport rect and click-to-navigate; implemented as a MinimapLayer inside the scene, exposed to the app chrome as a plain HTMLCanvasElement through a SceneController getter so no React boundary is crossed.

- [ ] `P02.S05` - Implement MinimapLayer: a fixed-overlay Graphics container that mirrors node dot positions from FieldLayout position frames, scaled to a 120x120 viewport, with a colored border-rect for the current camera viewport; `frontend/src/scene/field/minimapLayer.ts`.
- [ ] `P02.S06` - Wire MinimapLayer into DashboardField: compose on mount, feed position frames and camera onChange, emit navigate-to pointer on minimap click, and expose minimapCanvas getter on SceneController; `frontend/src/scene/field/fieldAssembly.ts, frontend/src/scene/sceneController.ts`.
- [ ] `P02.S07` - App-layer MinimapWidget: a React wrapper that appends sceneController.minimapCanvas via useEffect DOM insertion, toggled by SceneController.setMinimapVisible and a keyboard shortcut; `frontend/src/app/stage/MinimapWidget.tsx`.

### Phase `P03` - Scene polish and green gates

Smooth camera spring animation for programmatic navigation, incremental edge-mesh update on delta-apply (eliminate full-rebuild), arrowhead glyphs at near-zoom LOD, and the full four-gate verification pass.

- [ ] `P03.S08` - Add Camera.animateTo with RAF-based damped lerp (damping=0.85, stop at sub-0.5px delta) and use it in the focus-node command and minimap navigate-to so programmatic pan no longer snap-jumps; `frontend/src/scene/field/camera.ts, frontend/src/scene/field/fieldAssembly.ts`.
- [ ] `P03.S09` - Incremental edge-mesh update on delta-apply: add EdgeMeshLayer.updateEdge to replace the full applyModelToLayers rebuild on apply-deltas paths and add arrowhead triangle glyphs on directed edges at near-zoom LOD; `frontend/src/scene/field/edgeMeshes.ts, frontend/src/scene/field/fieldAssembly.ts`.
- [ ] `P03.S10` - Run all four green gates: npm run typecheck, npm run lint, npm run test (71+ files including adversarial suite), npm run build; vaultspec-core vault check all green; every Step closed before review; `frontend/src/scene/, frontend/src/app/stage/`.

## Description

The `graph-quality` plan drives the node-graph centerpiece to Obsidian-class quality
across three axes: interactive layout tuning, spatial orientation (minimap), and
scene-rendering polish. It is backed by the `dashboard-optimization` ADR (completeness
campaign, C-A1/A3 and the FA2 settle policy) and the `constellation-live-delta` ADR
(the spliceLive prerequisite S05-S07 already queued in that plan).

P01 opens the FA2 layout worker as a tunable surface: gravity, repulsion strength, edge
influence, and inertia/decay are exposed through a `params` message that the worker
merges before its next tick, mirroring the Obsidian graph-settings panel. A
`CircularLayout` module provides the alternate mode (nodes on a circle of radius
proportional to `sqrt(N)`) accessible as `set-layout-mode`. A `layout-changed`
SceneEvent closes the feedback loop to the app chrome without polling.

P02 delivers the minimap. A `MinimapLayer` inside the scene maintains a
fixed-overlay canvas that mirrors node dot positions from `FieldLayout` position
frames, draws a viewport-rect border that tracks the camera, and fires a `navigate-to`
world coordinate on pointer click. The scene exposes this as a plain `HTMLCanvasElement`
via a `SceneController` getter; the app chrome mounts it with a DOM-insertion `useEffect`
and a toggle keyboard shortcut, crossing no React data boundary.

P03 polishes the rendering surface and closes the gates. `Camera.animateTo` replaces
instant-set with a damped RAF lerp so focus-node and minimap clicks animate smoothly.
`EdgeMeshLayer.updateEdge` makes delta-apply incremental instead of a full-rebuild.
Arrowhead glyphs appear on directed edges at near-zoom LOD. S10 is the explicit gate
step: all four frontend green gates plus `vault check all` must pass; the adversarial
suite is included and may only be kept green by root-cause fixes.

## Parallelization

Within P01: S01 (worker params) is the prerequisite for S02 (FieldLayout/command
routing) because `setParams` delegates to the worker. S02 and S03 (CircularLayout)
share no file overlap and may run concurrently after S01. S04 (layout-changed event)
depends on S02 (the event fires from `DashboardField.command` after S02 wires it).

Within P02: S05 (MinimapLayer class) is the prerequisite for S06 (DashboardField
integration) which is the prerequisite for S07 (MinimapWidget app mount). Sequential.

P01 and P02 have no hard ordering between them and may execute concurrently if separate
executors are available. P03 depends on both P01 and P02 being complete (S08-S09 touch
`fieldAssembly.ts` which P01/P02 also modify; S10 verifies the whole surface). P03
executes last.

## Verification

Layout controls:
- `fa2.worker.ts` handles a `{kind: "params", settings: {...}}` message and applies the
  merged settings on the next tick without restarting; gravity, scalingRatio,
  edgeWeightInfluence, and slowDown are all tunable.
- `SceneController` surfaces `getLayoutState(): {mode: "force"|"circular", params: FA2PartialSettings}`.
- A `layout-changed` SceneEvent fires synchronously after `set-layout-params` and
  `set-layout-mode` commands are processed.
- `CircularLayout` places N nodes on a circle; switching mode via `set-layout-mode`
  re-seeds positions without restarting the FA2 worker in circular mode.

Minimap:
- `MinimapLayer` renders node dots within a 120x120 canvas and draws a viewport-rect
  border that tracks the camera; updates propagate within one position-frame callback.
- A pointer click on the minimap canvas fires a `navigate-to` event carrying a world
  coordinate; `Camera.animateTo` smoothly pans to that point.
- `SceneController.minimapCanvas` returns the overlay `HTMLCanvasElement`; it is null
  before the first mount.
- `SceneController.setMinimapVisible(false)` hides the overlay without destroying it.

Polish:
- `Camera.animateTo` uses RAF-based damped lerp; focus-node and minimap clicks animate
  rather than snap-jump.
- `apply-deltas` does not trigger a full `applyModelToLayers` rebuild; `EdgeMeshLayer.updateEdge`
  is called per-delta entry.
- Directed edges display arrowhead triangle glyphs when `camera.scale >= 1.6`; glyphs
  are suppressed at far zoom.

Gates (S10):
- `npm run typecheck` clean.
- `npm run lint` clean.
- `npm run test` green on all test files including the adversarial suite; adversarial
  failures resolved by root-cause fix only, never by weakening or skipping tests.
- `npm run build` clean.
- `vaultspec-core vault check all` green.
- Every Step in the plan closed (`- [x]`) and reviewer sign-off obtained before closure.
