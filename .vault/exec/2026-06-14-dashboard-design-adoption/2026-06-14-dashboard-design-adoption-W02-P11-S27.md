---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S27'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---




# Re-skin the minimap widget and layer to consume the new token layer per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green

## Scope

- `frontend/src/app/stage/MinimapWidget.tsx`

## Description

Recodified the existing minimap navigator onto the base design-language and
iconography ADRs without reopening its architecture, seam, or layer ownership.
Two cooperating files changed: the chrome shell `MinimapWidget.tsx` and the
scene-owned canvas renderer `minimapLayer.ts`; their tests were extended and a
new render test added.

Per-ADR element inventory and disposition:

- Panel shell (rounded, soft low-contrast rule, subtle elevation, recessed):
  re-skinned — replaced the retired brand `shadow-card` with the panel-grade
  elevation the sibling floating chrome uses (`shadow-panel`); kept the OKLCH
  token utilities (`bg-paper-raised/90`, `border-rule`, `rounded-vs-md`).
- Header strip + quiet "Map" label (smallest UI step, faint ink role): kept,
  in `text-2xs ... text-ink-faint`.
- Collapse/expand control (Lucide chevron, focusable, state-accurate): re-skinned
  — added a visible focus ring (`focus-visible:outline-focus`), token hover
  (`hover:bg-paper-sunken`), and `aria-expanded` reflecting state.
- Overview canvas (accessible name): kept and strengthened — `role="img"` plus a
  descriptive accessible name that states the click/drag affordance and the
  viewport rectangle.
- Ground / node dots / feature dots / viewport rectangle / frame: kept the prior
  token reads (`--color-canvas-bg`, `--color-ink-muted`, `--color-state-active`
  for feature + viewport, `--color-rule`); no off-palette literal remains.
- Click-to-navigate: kept (forwards a recovered world coordinate to the navigate
  callback; the scene applies the camera change).
- Drag-to-navigate: NEW — added pointer down/move/up scrub gesture in the scene
  layer, resolving to the same navigate callback.
- Loading / no-layout-yet and empty / no-field states: NEW — the renderer now
  always paints the attenuated ground + frame and, when the slice has no nodes,
  draws a quiet "nothing to map yet" affordance in the faint ink role rather than
  early-returning blank.
- Viewport out-of-bounds / off-screen: NEW — the viewport rectangle is clamped to
  the canvas bounds so it never strokes off-canvas.
- Degraded / error states: inherent — the minimap overviews whatever reduced node
  set the scene holds and has no independent failure surface (it fetches nothing).
- Keyboard / non-pointer-only navigation: NEW — a focusable "recenter" control on
  the header issues the canonical `fit-to-view` `SceneController` camera command,
  converging keyboard navigation on the scene's camera channel.
- Reduced-motion: inherent — minimap-initiated camera moves snap instantly at the
  scene layer (`camera.animateTo` honors `prefers-reduced-motion`).

Tests: extended `minimapLayer.test.ts` with palette-completeness (every drawn
colour is one of the four tokens), theme-flip re-resolution, the empty-state draw,
viewport clamping, the single-stroked-outline grayscale property, and click + drag
navigation; added `MinimapWidget.render.test.tsx` for the accessible group/canvas
names, the collapse `aria-expanded` toggle, the seam register/unregister on
collapse, and the recenter affordance issuing `fit-to-view`.

## Outcome

Both scoped files recodified onto the token layer with every ADR-named state and
accessibility behavior realized, layer ownership preserved (chrome owns the shell;
the scene owns canvas pixels and applies the camera; no fetch, no raw `tiers`).
Full frontend lint gate (`just dev lint frontend`: eslint + prettier + tsc) exits
0. Targeted minimap suites pass 19/19; full frontend suite 748 passed, 9 pre-existing
skips (a live-origin server suite), no regressions.

## Notes

The navigation wiring was kept on the existing scene-owned `navigateCb` →
`navigateToWorld` → `camera.animateTo` path rather than rerouted onto a new
`SceneController` camera command, because that path already satisfies the binding
constraint (the chrome never moves the camera; the scene applies it) and the
rewiring would require editing `fieldAssembly.ts` / `sceneController.ts`, which are
held by concurrent agents under the step's scope fence. The ADR's command-channel
routing is a stated consistency preference, not the binding constraint; the keyboard
recenter affordance does flow through the `SceneController` `fit-to-view` command, so
the keyboard path uses the canonical channel. The pointer-gesture rewiring is a
clean follow-up once the scene files are free.

ADR insufficiency for refinement: the ADR specifies the empty "nothing to map yet"
copy as a canvas affordance but does not state whether that string must also be
exposed non-visually (the canvas is `role="img"` with a static accessible name, so
the empty copy is not announced to AT on transition). A future refinement could
mirror the empty/loading state into the canvas's `aria-label` or a sibling
`role="status"` region, consistent with how the nav toolbar surfaces its degraded
state non-visually.

## Revision (post-review PASS-WITH-REVISIONS, no HIGH)

Independent review confirmed the token-read seam, single-accent discipline,
grayscale viewport, bounded client geometry, and layer ownership correct, and
returned fidelity/a11y revisions. Landed:

- MEDIUM-1 — the empty-state copy draws with `--color-ink-muted`, but the ADR
  specifies the FAINT ink role. Resolved honestly: `--color-ink-faint` is
  `var()`-aliased on `:root`, so it is not scene-readable through
  `getPropertyValue` (only the literal-hex scene-read subset is), and no
  scene-readable faint hex token exists. Added a code comment documenting that
  muted is the readable-token approximation of the faint role, and recorded the
  empty-label contrast on the warm low-chroma scene ground (`--color-canvas-bg`),
  measured from the shipped hex tokens: light 6.57:1, dark 7.21:1,
  high-contrast 14.46:1 — all clear the 4.5:1 floor. `styles.css` was not touched.
- MEDIUM-2 — added a test asserting the empty-label fill resolves from a palette
  token (the muted-ink scene token), not a literal, plus a theme-flip test proving
  the label colour is read live; the per-theme contrast is noted in the test.
- LOW — added `aria-controls` on the collapse button pointing at the canvas
  wrapper region id (with a render test); added a comment that the click/drag pan
  is intentionally pointer-supplementary (full keyboard pan/zoom lives on the
  field + NavToolbar); added a comment that binding feature/viewport to
  `--color-state-active` is the intentional accent / structural-tier unification.

Re-gated: full `just dev lint frontend` (eslint + prettier + tsc) exit 0; full
frontend suite 789 passed, 9 pre-existing skips, no regressions; targeted minimap
suites 22/22.
