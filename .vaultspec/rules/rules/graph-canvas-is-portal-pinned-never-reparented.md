---
derived_from:
  - "audit:2026-06-18-editor-dock-workspace-audit"
---

# The graph's Pixi canvas is portal-pinned and never re-parented

## Rule

The PixiJS `<canvas>` that backs the scene (`frontend/src/scene/`) must be mounted
exactly once, for the app's lifetime, in a host DOM node that is a SIBLING of — never
inside — any panel/dock/layout container that re-flows or re-parents its children. A
docking, tabbing, or split-pane library (dockview) may own only an empty placeholder that
the canvas host TRACKS by rect; it must never own the canvas element itself. Re-parenting
the canvas DOM node — moving it between containers, remounting it under a new parent, or
letting a layout library adopt it — is forbidden, because it destroys the WebGL context
and the live `SceneController`.

## Why

Moving a `<canvas>` to a new DOM parent forces the browser to drop and recreate its WebGL
context, which tears down the Pixi renderer and every GPU resource the `SceneController`
holds — the graph goes blank and all scene state is lost. The `2026-06-18-editor-dock-
workspace` cycle made the headline graph a real dockview panel (fully tabbable/movable/
hot-dockable), which would normally re-parent the panel's contents on every dock; the
portal-pin contract is what made that safe. The audit verified it by construction (the
canvas host is a sibling of the dockview container; the graph panel is only a placeholder)
and live verification confirmed it at the DOM level — `dockview.contains(pixiCanvas)`
stayed `false` through an actual split/reconfiguration while the canvas host tracked the
panel's new rect. It generalises beyond dockview: any future layout system that could
adopt the canvas must instead drive a tracked, app-lifetime host.

## How

- **Good:** the canvas host renders the `<Stage/>` once in an app-lifetime node that is a
  sibling of the dock container; a `canvasPin` rect bridge (`ResizeObserver` + a bounded
  settle loop) tracks the dock placeholder's screen rect and positions the host over it,
  so docking moves the *placeholder*, not the canvas — `SceneController` and the WebGL
  context survive untouched.
- **Good:** a new split/tab/float surface needs the graph — it adds a placeholder panel
  and points the rect bridge at it; the canvas is never handed to the layout library.
- **Bad:** mounting `<Stage/>` (or the `<canvas>`) *inside* the dockview panel component,
  or any code that re-parents/remounts the canvas node on a layout change — the GL context
  is destroyed on the first dock and the graph blanks. Verify with a live assertion that
  the canvas element is NOT a descendant of the dock container.

## Status

Active. Promoted from the `2026-06-18-editor-dock-workspace` review (the portal-pin contract
held across research → ADR → plan → execute → review and was live-verified by DOM
assertion). Sibling of `view-rewrite-preserves-the-state-and-scene-contract` (the scene
contract the rewrite preserves), `dashboard-layer-ownership` (scene receives data only
through `SceneController`), and `graph-compute-is-cpu-gpu-is-render-and-search` (GPU is the
scene's, and a torn-down context forfeits it).

## Source

Audit `2026-06-18-editor-dock-workspace-audit` (portal-pinned-canvas contract verified by
construction + live DOM assertion). ADR `2026-06-18-editor-dock-workspace-adr`. Sibling
rules `view-rewrite-preserves-the-state-and-scene-contract`, `dashboard-layer-ownership`,
`graph-compute-is-cpu-gpu-is-render-and-search`.
