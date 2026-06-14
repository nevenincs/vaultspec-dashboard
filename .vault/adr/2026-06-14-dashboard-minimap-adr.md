---
tags:
  - '#adr'
  - '#dashboard-minimap'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
  - "[[2026-06-14-dashboard-design-language-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---



# `dashboard-minimap` adr: `minimap` | (**status:** `accepted`)

## Problem Statement

The dashboard's main field renders a node graph that, at any meaningful scale, extends
well beyond the visible viewport. An operator who has zoomed into a feature
constellation or panned into a corner of the field loses the where-am-I context the
overview gives: which part of the whole field is on screen, what lies outside it, and
how to jump elsewhere without a long manual pan. The minimap is the overview-context
companion to the node canvas: a small attenuated widget, docked in a corner, into which
the scene draws the whole bounded field at a glance, marks the current viewport as a
rectangle, and accepts click and drag to move the camera there.

A minimap already exists in the codebase from the 2026-06-13 graph-quality addenda
(`MinimapWidget.tsx` chrome plus the `MinimapLayer` scene module behind the
`setMinimapCanvas` seam). Its layering is sound, but it was built under the now-retired
"paper-warm brand" visual language: it styles itself with retired brand utility classes
and paints node dots and the viewport rectangle with hard-coded hex literals rather than
reading the shared canvas tokens. This ADR recodifies the minimap onto the base design
language and iconography ADRs without reopening its architecture. It is spec work; it
authorizes no implementation and re-decides none of the base language. The main field
rendering, the camera/nav toolbar, and the lens/filter controls are separate sibling
ADRs (`dashboard-node-canvas`, `dashboard-nav-controls`, `dashboard-canvas-controls`);
this ADR specifies only the minimap and references those as boundaries.

## Considerations

The minimap exists today as two cooperating parts across the chrome/scene boundary. The
chrome part, `MinimapWidget.tsx`, is an absolutely-positioned panel docked bottom-right
of the stage with a collapsible header and a `canvas` element; on mount it registers
that canvas with the scene through `controller.setMinimapCanvas(canvasRef.current)`, and
on collapse or unmount it passes `null` to stop the scene rendering frames. The scene
part, `MinimapLayer`, takes ownership of every pixel inside that canvas: it draws a
downscaled overview of node positions plus the viewport rectangle into a plain 2D canvas
context (deliberately not Pixi — no second WebGL context), re-rendering on each layout
position frame and on every camera change, and it inverts its own transform on a canvas
click to recover a world coordinate. The chrome never touches the canvas drawing API.
The seam is the established pattern: chrome provides the surface, the scene paints it.

The current form already reads two shared canvas tokens correctly — it pulls
`--color-canvas-bg` for the ground and `--color-rule` for its frame via
`getComputedStyle(document.documentElement)`. But it then paints node dots with a
literal `#888`, feature dots and the viewport rectangle with a literal `#5b8cf5`, and
styles its chrome shell with retired brand utilities (`bg-paper-raised`, `text-ink-faint`,
`border-rule`, `shadow-card`). Those literals and brand classes are exactly what the
recodification removes: under the base language the minimap's ground, node marks,
feature accent, and viewport rectangle must all derive from the same `:root` semantic
token layer the main canvas scene reads, so the overview and the field it overviews share
one palette across dark, light, and high-contrast themes by construction.

What the base language requires of this widget specifically: it is supporting chrome, so
it must be attenuated — the work surface (the field) leads, and the minimap "does not
compete for attention it has not earned" (depth/form layer 4, density layer 7). It reads
its colors from the shared canvas tokens, not its own literals (color discipline layer 3,
the cross-layer token-read constraint). Its single collapse/expand affordance uses the
sanctioned structural-chrome icon family, Lucide, exactly as it does today (chevrons are
canonical chrome marks under the iconography ADR). Its geometry is consistently rounded
and its border is a soft low-contrast rule. It carries no second accent and no decorative
texture; the one hue it spends is the shared accent, on the viewport rectangle and the
feature marks, as redundant reinforcement of position, never as the sole signal.

## Constraints

GPU and scene rendering are render-only and CPU graph-compute stays CPU-side: the
minimap holds and computes no graph model. It receives node positions and camera state
from the scene (which already owns layout coordinates) and draws them; it derives no
edges, runs no layout, and never asks the engine for anything. This honors the
graph-compute-is-CPU / GPU-is-render boundary — the minimap is pure rendering over
positions the scene already holds. Note that the minimap's own draw is plain 2D canvas,
not GPU; the constraint that matters is that it computes no model, not which raster path
it uses.

The minimap reflects the bounded field, not an unbounded full graph. The field it
overviews is whatever bounded slice the stores layer has fetched and handed to the scene
— a feature constellation by default, or a bounded document subgraph on descent, always
under the engine's node ceiling with truncation stated honestly. The minimap draws the
nodes the scene is holding and no more; it never reaches for "the whole graph" and never
serializes or requests anything itself. If the served slice is truncated, the minimap is
an honest overview of the truncated slice, consistent with the bounded-by-default rule.

Navigation intent flows as camera movement through the scene, never as direct mutation
from chrome. The minimap is supplementary navigation; the camera is owned by the scene's
`Camera` and is driven by the established `SceneController` command channel (`zoom-in`,
`zoom-out`, `fit-to-view`, `reset-view` and the field's pan). The recodification should
route the minimap's click/drag-to-navigate as a camera command through that channel for
consistency with the rest of the dashboard's navigation, rather than through the bespoke
direct navigate-to-world callback the current implementation wires from the scene's
minimap layer into the field. Whichever wiring is chosen, the chrome widget must never
move the camera itself: it provides the canvas and forwards user intent; the scene
applies the camera change and re-renders both the field and the minimap.

The minimap reads canvas tokens from the shared `:root` and emits none of its own. Ground,
node mark, feature accent, viewport rectangle, and frame all come from the same semantic
token layer the main canvas reads via `getComputedStyle`; a theme switch repaints the
minimap with no widget-local color knowledge, exactly as it repaints the field.

What it must NOT do: it must not `fetch` the engine or read the raw `tiers` block (it is
app-chrome hosting a scene-drawn canvas; all wire access is the stores layer's, and the
minimap consumes none of it directly); it must not define its own node shape or graph
model; it must not be the sole means of navigation (keyboard navigation must exist on the
main canvas independently); it must not introduce a second accent, gradient, texture, or
the retired hand-drawn glyphs or brand utility classes; and it must not block or freeze
when there is no field — it degrades to a designed empty state.

## Implementation

**Scope.** Recodify the existing minimap (the `MinimapWidget.tsx` chrome shell and the
`MinimapLayer` scene module behind `setMinimapCanvas`) onto the base design language and
iconography. Architecture, layering, and the seam are unchanged; the change is visual
(tokens, attenuation, geometry, motion), the navigation-wiring consistency note, and the
explicit state and accessibility behaviors below. No new model, no new endpoint, no
engine change.

**Placement and form.** The minimap docks in a corner of the stage (bottom-right, as
today), attenuated supporting chrome: a small rounded panel with a soft low-contrast 1px
rule border, a subtle elevation, and a slightly recessed presence so the field leads. Its
dimensions stay compact and fixed (instrument-grade density). A small header strip carries
a quiet "Map" label in the dimmed-chrome ink role and the collapse control; the label uses
the UI sans at the smallest UI step, set in the muted/faint ink role, not full-strength
ink.

**What it renders.** Inside the canvas the scene draws a downscaled overview of the
current bounded field — one small mark per node, positioned by the layout coordinates the
scene already holds, with feature/constellation nodes drawn slightly larger and in the
shared accent as redundant reinforcement — plus the current viewport as a stroked
rectangle in the shared accent, computed from camera scale and offset. Every color is
read from the shared `:root` canvas tokens (ground, node mark, accent, rule); the present
hard-coded `#888` and `#5b8cf5` literals are removed in favor of those tokens, so the
minimap and the field it overviews share one palette per theme. Marks stay small and
unlabelled — the minimap shows shape and distribution, not identity; identity lives in the
field and the inspector. Hue is never the sole carrier of the viewport position: the
rectangle is also distinguished by being the only stroked outline on the overview.

**Interactions.** Click-to-navigate: a click in the overview moves the camera so the
clicked world point becomes the viewport center. Drag-to-navigate: dragging the viewport
rectangle (or anywhere in the overview) pans the camera continuously to follow the
pointer, giving a scrub-the-field gesture. Both are expressed as camera movement applied
by the scene through the `SceneController` camera command channel, keeping minimap
navigation consistent with the toolbar's zoom/fit/reset commands; the chrome widget never
mutates the camera directly. The minimap is a convenience over the field's own pan/zoom,
not a replacement for it.

**Collapse / show.** The widget keeps its single collapse/expand affordance — a Lucide
chevron in the sanctioned structural-chrome family — toggling between the full overview
and a collapsed header-only state. While collapsed the canvas is unregistered from the
scene (`setMinimapCanvas(null)`) so the scene stops spending frames on it, and the canvas
element stays in the DOM (hidden) so its ref survives the round-trip and re-registers
cleanly on expand. The collapse toggle is instant (keyboard-grade), not animated.

**States.** Loading — before the first layout frame arrives, the minimap shows its
attenuated empty ground (no marks, no rectangle) rather than a spinner; it is a passive
overview and has nothing to spin for. Empty / no-field — when the served slice has no
nodes (an empty scope or a fully-filtered field), the minimap shows the empty ground with
a quiet, approachable one-line "nothing to map yet" affordance in the faint ink role,
never an error. Degraded — when the field itself is degraded (a tier absent per the
`tiers` block, which the minimap learns about only indirectly, through the reduced node
set the scene is holding), the minimap simply overviews whatever the scene is showing;
degradation is the field's designed state, and the minimap mirrors it without inventing
its own degraded chrome. Error — the minimap has no independent failure surface because
it fetches nothing; if the scene cannot render the field at all, the minimap shows its
empty ground and the field surface owns the error message. None of these states freeze or
crash the widget.

**Keyboard and accessibility.** Because a minimap is supplementary navigation and not the
sole means of moving the camera, full keyboard navigation must exist on the main canvas
independently (arrow/pan and zoom, owned by the field and toolbar ADRs); the minimap may
not be the only path to any region of the field. The minimap's own affordances are
keyboard-reachable: the collapse/expand control is a real focusable button with an
accurate `aria-label` that reflects state, and the overview canvas carries an accessible
label naming it as the graph minimap. Where the minimap offers keyboard panning, it does
so by issuing the same camera commands as its pointer gestures, so keyboard and mouse
navigation converge on one channel. `prefers-reduced-motion` is honored: camera moves
triggered from the minimap are instant rather than animated when reduced motion is set,
matching the base language's keyboard-instant rule, and the viewport rectangle tracks
without easing. Focus order places the minimap late in the stage's tab sequence, after the
primary field and controls, consistent with its attenuated supporting-chrome role.

**Layer ownership.** The minimap is app-chrome hosting a scene-drawn canvas: the chrome
(`frontend/src/app/`) owns the panel shell, the collapse state, placement, and the canvas
element; the scene (`frontend/src/scene/`) owns every pixel inside the canvas via
`MinimapLayer` and applies all camera changes. Chrome provides the canvas through
`SceneController.setMinimapCanvas` and never calls the canvas drawing API; navigation
intent flows scene-ward as camera commands. The widget never `fetch`es the engine and
never reads the raw `tiers` block — it is downstream of the stores layer entirely, drawing
only positions and camera state the scene already holds. This keeps the single-wire-client
boundary intact: no new wire access is created for the overview.

**Projection over the one model.** The minimap is a projection over the same single model
every other view projects — the engine's `LinkageGraph`, mirrored client-side by the
stores layer and laid out by the scene. It adds no model, no node schema, and no endpoint;
it is a second view of the exact node set the field is already showing, rendered at
overview scale. Adding the minimap therefore added no architecture, and recodifying it
adds none either.

**Tokens, motion, density applied.** Ground, node mark, feature accent, viewport
rectangle, and frame all resolve from the shared semantic token tier on `:root`; the
single accent is the only hue spent. Geometry is consistently rounded; the border is a
soft low-contrast rule; elevation is subtle. Motion is minimal and state-communicating:
the viewport rectangle tracks the camera continuously (it reflects real state, not
decoration), collapse is instant, and reduced-motion makes minimap-initiated camera moves
instant. Density is compact and fixed. No textures, gradients, second accents, retired
glyphs, or brand utility classes survive the recodification.

## Rationale

The minimap is an overview-first instrument exactly in the spirit of the base language's
progressive-disclosure grammar (overview first, then zoom and filter, then
details-on-demand): it is the literal overview surface for the field. Recodifying rather
than rebuilding is the correct posture because the existing seam (chrome canvas registered
through `setMinimapCanvas`, scene owning the pixels, navigation flowing scene-ward) already
honors the layer-ownership and projection rules; only its visual language was out of date.
Moving its node, feature, and viewport colors onto the shared `:root` token layer is the
specific fix that makes the overview and the field agree across themes by construction —
the same cross-layer token-read mechanism the base ADR makes load-bearing. Routing its
click/drag through the `SceneController` camera channel aligns it with the rest of the
dashboard's navigation and removes a one-off direct-mutation path. Keeping the minimap
explicitly supplementary, with mandatory independent keyboard navigation on the main
canvas, follows directly from the accessibility gates the base and iconography ADRs
preserve: a small overview widget can never be the sole way to reach part of the field.

## Consequences

- **Gains.** The overview shares one palette with the field across dark, light, and
  high-contrast themes for free, because every minimap color resolves from the same
  shared token layer the canvas reads; the retired brand literals and utility classes
  leave the widget; navigation gains consistency by flowing through the one camera command
  channel; and the supplementary-not-sole framing makes the accessibility obligation
  (keyboard navigation on the main canvas) explicit rather than assumed.
- **Costs and difficulties.** The recodification touches both the chrome shell (brand
  utilities to token-driven styling) and the scene draw (hex literals to token reads), so
  it spans the chrome/scene boundary even though it changes no architecture; the token
  reads must be re-validated per theme so the small marks stay legible on the warm ground
  in every theme; and rerouting navigation onto the camera command channel means retiring
  the bespoke navigate-to-world callback without regressing click/drag responsiveness.
- **Risks.** Small overview marks risk dropping below legibility on a warm low-chroma
  ground if the node-mark token is too close to the ground token; contrast must be checked
  per theme. The viewport rectangle must stay the single stroked outline so its position
  reading does not depend on hue alone. Drag-to-navigate must stay responsive under
  reduced-motion (instant, not eased) without feeling like it skips.
- **Pathways opened.** A token-correct minimap becomes a reusable overview pattern for any
  future bounded field view; once navigation flows entirely through the camera command
  channel, future overview affordances (e.g. a zoom-to-region drag) are additive on the
  same channel; and the shared-token discipline keeps the overview theme-correct as new
  themes (including a first-class high-contrast theme) land.

## Codification candidates

None. The minimap introduces no new durable cross-surface constraint. Its governing
rules - GPU is render-only, bounded-field rendering, app-chrome layer ownership, and
views-project-over-one-model - are already codified project rules, applied here per
surface rather than restated.

