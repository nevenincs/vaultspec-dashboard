---
tags:
  - '#adr'
  - '#dashboard-nav-controls'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
  - "[[2026-06-14-dashboard-design-language-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---


# `dashboard-nav-controls` adr: `navigation controls` | (**status:** `accepted`)

## Problem Statement

The dashboard's stage carries a navigation toolbar — the camera and level-of-detail
controls a user reaches for to move through the graph field. Today that toolbar
(`frontend/src/app/stage/NavToolbar.tsx`) was assembled during the GUI build's graph-quality
addenda: it exposes zoom-out / zoom-in around a semantic-level label, fit-to-view, reset-view,
a layout-controls toggle, a feature-versus-document granularity segmented control, and a
browser fullscreen button, all rendered with Lucide glyphs (`Minus`, `Plus`, `Maximize2`,
`RotateCcw`, `Settings2`, `Maximize` / `Minimize`) against the now-retired paper-warm token
palette (`bg-paper-sunken`, `text-ink-faint`, `border-rule`, `shadow-card`).

The base design-language recodification retires that paper-warm skin and fixes a convergent
agentic-desktop register; the iconography ADR fixes the icon sources. This ADR records how the
navigation controls re-settle onto that base register. It is the surface-specific decision for
the **stage camera and LOD controls only**: the pan/zoom/fit/reset camera affordances, the
semantic-level label, the granularity toggle, and fullscreen. It is spec work — it re-skins and
re-grammars an existing toolbar and pins its interaction contract; it neither re-architects the
scene seam nor specifies the sibling stage surfaces (the minimap, the tier dial, the filter
controls, and the algorithm/layout panel each carry their own ADR and are referenced here as
neighbors, not respecified). It changes no application code; a later plan sequences adoption.

## Considerations

The toolbar already exists and already obeys the seam discipline, so this is a re-skin plus a
contract tightening, not a rebuild. Its current form establishes the baseline this ADR inherits
and re-grammars.

The camera affordances are driven entirely through `SceneController.command()`. The four camera
command kinds — `zoom-in`, `zoom-out`, `fit-to-view`, `reset-view` — are locked members of the
`SceneCommand` union in `frontend/src/scene/sceneController.ts`, landed in the graph-quality
addenda (P01.S02); the field renderer executes them and the camera math (clamp, semantic level)
lives in `frontend/src/scene/field/camera.ts`. The toolbar reads no camera state directly: it
subscribes to the controller's event channel and updates the semantic-level display from the
`camera-change` event (`{ kind, scale, level }`), where `level` is one of `constellation`,
`feature`, `document` as classified by `semanticLevel(scale)`. This is the model/view boundary
working as designed — the scene owns the camera, the chrome reflects it.

The granularity toggle is a different concern from the camera: it reads and writes
`granularity` (`feature` | `document`) on the view store (`frontend/src/stores/view/viewStore.ts`),
which `Stage` consumes to re-query the wire at the chosen LOD. Granularity is a *data-fetch*
descent (which slice the engine serves), while the semantic level is a *render* state (how far
the camera is zoomed); the toolbar deliberately surfaces both, and the design must keep them
legibly distinct rather than conflating zoom with granularity.

The base language requires this toolbar to read as attenuated chrome that does not compete with
the work surface: dimmed navigation, the active surface brightest; structure felt through subtle
elevation and soft rounded low-contrast borders, not heavy boxes; one muted accent spent only on
the active/pressed state; tabular numerals on any data-bearing label; fast, subtle,
state-communicating motion with keyboard-initiated actions feeling instant and
`prefers-reduced-motion` honored; and compact-but-breathing density. The iconography ADR places
all of these structural marks — zoom, fit, reset, fullscreen, settings/toggle, chevrons — on
Lucide, which the toolbar already uses; the correction the iconography ADR mandates (declaring
`lucide-react` as a real dependency rather than a phantom import) is inherited, not re-decided
here.

## Constraints

- **Camera commands flow one way through the seam.** The controls emit
  `SceneController.command({ kind: ... })` for every camera affordance and never touch the Pixi
  renderer, never poll per-frame camera state, and never compute layout or transforms. GPU is
  render-only; the toolbar holds no world coordinates and performs no graph compute. The
  semantic-level label is read from the `camera-change` event, never derived in chrome.
- **App-chrome never fetches.** Per the layer-ownership boundary, the toolbar lives in
  `frontend/src/app/` and reads all wire-derived state — granularity, time-travel mode,
  degradation truths — only through stores hooks; it issues no `fetch`, defines no node shape,
  and reads no raw `tiers` block. The granularity control is a write to a stores setter, not a
  query the toolbar runs.
- **Bounded-by-default descent is inherited, not re-decided.** The granularity toggle exposes the
  two LOD slices the contract already bounds: the feature constellation is the unbounded-safe
  default view, and the document granularity is served under the engine's document node ceiling
  with honest truncation. The toolbar must not offer an "everything, unbounded" descent; it
  switches between the two contract-bounded slices the stores already request.
- **State-isolation is honored.** The toolbar's granularity write and its level display are
  per-view state; they must not leak across scope or corrupt sibling view state, consistent with
  the stores-layer isolation invariants.
- **Inherit the base language verbatim.** No new tokens, motion grammar, density scale, or icon
  set is introduced. Icons come from the two sanctioned families (here, Lucide chrome marks);
  color, elevation, radius, and motion come from the shared `:root` token layer the base ADR
  defines. This ADR introduces nothing new — it re-points an existing toolbar at the new register.
- **Parent stability.** The `SceneCommand` camera union, the `camera-change` event, the
  `SemanticLevel` classification, and the view store's `granularity` and `timelineMode` fields are
  all shipped and stable; this ADR depends only on existing, settled surfaces and adds no new seam
  member.

## Implementation

**Scope.** The stage navigation toolbar's camera and LOD controls: a zoom-out / level-label /
zoom-in cluster, fit-to-view, reset-view, the granularity segmented control, and fullscreen.
The layout-controls (algorithm panel) toggle physically lives in the same toolbar today but is
the algorithm panel's surface; this ADR keeps it grouped here for spatial coherence but defers
its grammar to the algorithm-panel ADR. The minimap and tier dial are separate stage surfaces
and are out of scope.

**Control set and grouping.** The toolbar is a single horizontal rail of icon buttons, grouped by
concern with thin hairline separators between groups. Group one is the camera cluster: zoom-out, a
semantic-level label, zoom-in, then fit-to-view and reset-view. Group two is the LOD descent: the
feature-versus-document granularity segmented control. Fullscreen sits at the trailing edge as a
single toggle. The separators are the base language's soft low-contrast rules, not heavy
dividers. Each affordance is a square icon button at the compact density the base scale defines;
the camera buttons dispatch their `SceneCommand` kind on click, the granularity control writes the
stores setter, and fullscreen wraps the browser Fullscreen API best-effort (silently tolerating a
refusal).

**The semantic-level label.** Between zoom-out and zoom-in sits the current semantic level, fed by
the `camera-change` event and shown as a short token (`all` / `feat` / `doc` mapping to
`constellation` / `feature` / `document`). It is a read-only status reflection, not a control, set
in the base UI sans at the small instrument size with tabular numerals so the label width is
stable as the level changes; its accessible name spells the level in full. It is a "receipt" of
camera state in the base language's instrument-grammar sense — a thing the user verifies at a
glance — and must never be mistaken for the granularity control beside it.

**Granularity versus level — keeping them distinct.** Because the semantic level and the
granularity both speak of constellation-versus-document, the design separates them by form: the
level is a passive label inside the camera cluster, while granularity is an explicit
two-segment toggle in its own group with persistent labels (`feat` / `docs`) and a pressed
state on the active segment. The toggle's group carries an accessible name and a description that
states the feature constellation is the overview and the document graph the bounded full slice, so
the descent's bounded nature is communicated rather than implied.

**Placement on the stage.** The rail floats over the stage as attenuated, pointer-enabled chrome,
anchored to a stage corner and layered above the field with a subtle elevation (raised surface,
soft border, light backdrop blur) so it reads as chrome resting over the work surface, not as part
of it. It sits clear of the sibling stage surfaces (minimap, tier dial, filter controls) so the
corners stay legible; exact corner and offset are a layout detail for the plan, constrained only
by "attenuated, does not compete, clear of siblings."

**Icon usage.** Every mark is a Lucide structural glyph per the iconography ADR's chrome plane:
minus / plus for zoom, a maximize/fit mark for fit-to-view, a counter-rotate mark for reset, the
settings mark for the layout toggle, and the maximize/minimize pair for fullscreen state. Marks
render at the toolbar's small icon size in single `currentColor` ink drawn from the token layer,
so they are theme-correct across dark, light, and high-contrast for free. No domain (Phosphor)
marks appear here — the navigation rail is pure structural chrome. No new or bespoke glyph is
introduced.

**States.** Buttons carry the base language's discrete role states — rest (dimmed `ink-faint`-class
role), hover (a lift toward full ink on a subtle raised fill), and pressed/active (the muted accent
treatment) — sourced from the semantic token tier, not hand-listed colors. The granularity active
segment and the fullscreen-engaged button reflect pressed via `aria-pressed`. Disabled and
degraded states: in time-travel mode (the view store's `timelineMode` of kind `time-travel`) the
granularity descent and any control whose effect would fight the time-travel driver's ownership of
the scene are disabled with a clear disabled treatment and an explanatory title, because
time-travel is an enforced, unmistakable mode that owns the scene; camera pan/zoom/fit/reset stay
live in time-travel since they are pure view navigation. When the graph slice is loading or its
tier is degraded (read through stores hooks, never the raw `tiers` block), the affected controls
present a quiet loading or degraded affordance — a designed state, never an error — consistent with
the truthfulness mechanism. Fullscreen reflects the live OS fullscreen state and swaps its icon and
label accordingly.

**Keyboard contract and a11y.** The rail is a single ARIA toolbar with a roving-tabstop: one tab
stop enters the group, and left/right arrow keys walk between the buttons, handing focus off at the
ends back to the normal tab order — the arrow-walk handoff. Each control is a real button with an
accessible label (the camera commands, the granularity segments, fullscreen) and `aria-pressed` on
the toggles; the level label exposes its full level name. Direct keyboard shortcuts for the camera
commands (zoom, fit, reset) and the granularity descent are sanctioned in the base language's
keyboard-first register and surface through the command palette as the discoverable home, with the
toolbar buttons as the pointer equivalent; the exact bindings are a plan detail, constrained to not
collide with the palette (`Cmd/Ctrl+K`) or settings (`Cmd/Ctrl+,`). Per the base motion law,
keyboard-initiated actions feel instant — they do not animate — and any pointer-driven transition
(button hover, a camera ease) is short and is swapped for an instant state change under
`prefers-reduced-motion`.

**Layer ownership.** The toolbar is app-chrome: it emits `SceneController.command()` for camera
affordances, reads granularity / level / time-travel / degradation state through stores hooks and
the controller's event channel, and never fetches, never holds a node shape, and never reads the
raw `tiers` block. It is a dumb view projecting over the one model and emitting intent (camera
commands, granularity writes) back — no new model, no new wire access.

**Base tokens, motion, density.** Color, elevation, radius, separators, hover/pressed/focus-ring
states, type scale, tabular numerals, motion durations, and the reduced-motion swap all come from
the base design-language token layer and grammar; the paper-warm token classes the current
component uses are replaced by their semantic-tier equivalents during adoption. The rail stays
compact-but-breathing and attenuated.

## Rationale

The toolbar is the canonical case the base ADR was written for: a working, seam-correct surface
whose only debt is a retired skin. Re-pointing it at the convergent register and the sanctioned
icon families — rather than redesigning its interaction — is the lowest-churn way to make it native
to the agentic-desktop cohort while preserving every invariant. The camera-command seam, the
`camera-change`-fed level display, and the stores-owned granularity write already embody the
layer-ownership and views-are-projections rules; this ADR's job is to keep them intact under the
new language and to tighten the interaction contract (roving toolbar, distinct level-versus-
granularity grammar, time-travel disabling, bounded descent) that the base language's keyboard-
first, honest-degradation, attenuated-chrome laws imply. Keeping camera navigation live in
time-travel while disabling the granularity descent follows directly from the time-travel driver
owning the scene's data while the camera remains a pure view concern. The decision introduces
nothing new precisely because the base and iconography ADRs already decided the register and the
marks; the surface's only remaining choices are grammar and adoption.

## Consequences

- **Gains.** The navigation rail reads native to the cohort, theme-correct across dark / light /
  high-contrast for free via the shared token layer; the level-versus-granularity confusion is
  designed out; the keyboard and a11y contract becomes explicit (roving toolbar, instant
  keyboard actions, reduced-motion swap); time-travel and degraded states are handled honestly;
  and the seam discipline is preserved unbroken.
- **Costs and difficulties.** The paper-warm token classes must be migrated to semantic-tier
  equivalents and each control state contrast-proven per theme against the warm ground; the
  roving-tabstop toolbar and the time-travel disabling are new interaction work the current
  component lacks; and the shared placement with the deferred algorithm-panel toggle requires
  coordination with that sibling ADR so the rail's grouping stays coherent.
- **Risks.** The level-label and granularity-toggle proximity remains a confusion risk if the
  grammar separation is implemented loosely; keyboard bindings for camera commands risk colliding
  with the palette and other surfaces if not reserved centrally; and "attenuated chrome" must be
  held against the temptation to make the rail prominent.
- **Pathways opened.** A clean, tokened, roving-toolbar pattern here becomes the template for the
  sibling stage controls (minimap, tier dial, filters, algorithm panel) to follow, keeping the
  whole stage chrome consistent; future camera affordances slot in as new Lucide buttons emitting
  new `SceneCommand` kinds without re-deciding the grammar.

## Codification candidates

- **Rule slug:** `nav-camera-controls-emit-scene-commands-never-compute`.
  **Rule:** Stage camera and LOD controls in `frontend/src/app/` emit camera intent only via
  `SceneController.command()` and read level / granularity / mode / degradation state through
  stores hooks and the controller event channel — they never fetch, hold a node shape, read the
  raw `tiers` block, or compute layout/transforms. (Candidate; already implied by
  `dashboard-layer-ownership`, `views-are-projections-of-one-model`, and
  `graph-compute-is-cpu-gpu-is-render-and-search`; promote only if it holds across a cycle and is
  not fully covered by those siblings.)
