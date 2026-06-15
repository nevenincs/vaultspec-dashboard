---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S22'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---




# Re-skin the nav toolbar and controls to consume only the new semantic tokens and Lucide chrome per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green

## Scope

- `frontend/src/app/stage/NavToolbar.tsx`

## Description

- Re-skin the stage navigation rail (`frontend/src/app/stage/NavToolbar.tsx`) onto
  the new OKLCH semantic token surface: retire the retired paper-warm classes
  (`bg-paper-sunken` active state, `shadow-card`, raw `tabular-nums`) for their
  semantic-tier equivalents — the muted accent (`bg-accent-subtle`) is now spent
  only on the active/pressed state, elevation reads through `shadow-panel`, the
  level receipt uses the `data-tabular` hook, and every separator stays the soft
  low-contrast `bg-rule`.
- Keep all marks on Lucide chrome glyphs at a single small instrument size in
  `currentColor` (minus/plus zoom, maximize fit, counter-rotate reset, settings
  toggle, maximize/minimize fullscreen), theme-correct across dark/light/
  high-contrast for free; mark every icon `aria-hidden` since the button carries
  the accessible name.
- Author the roving-tabstop ARIA toolbar: one Tab-stop enters, ArrowLeft/
  ArrowRight/Home/End walk the enabled controls and clamp at the ends (handoff to
  the page tab order), disabled controls drop out of the walk, and a single active
  member carries `tabIndex 0`.
- Realize the level-versus-granularity grammar split: the semantic-level receipt
  is a passive `role=status` label fed by the `camera-change` event whose
  accessible name spells the level in full (`LEVEL_NAME`), kept formally distinct
  from the granularity descent's explicit two-segment toggle.
- Realize the honest disabled/degraded states: disable the granularity descent in
  time-travel (the timeline driver owns the scene's data) while keeping camera
  pan/zoom/fit/reset live as pure view navigation; paint a quiet busy/degraded
  affordance on the descent when the slice is loading or its tier is degraded.
- Add the `useGraphSliceAvailability` stores selector (and pure
  `deriveGraphSliceAvailability`) in `frontend/src/stores/server/queries.ts`,
  mirroring `useVaultTreeAvailability`, so the toolbar reads loading/degradation
  truth through a stores hook and never the raw `tiers` block.
- Add a render test (`NavToolbar.render.test.tsx`) exercising the ARIA toolbar,
  camera-command emission, level receipt, arrow-walk + single-Tab-stop, time-
  travel disabling, and the degraded affordance through the real mock-engine
  transport; extend the helper test for `LEVEL_NAME` and the queries test for the
  new availability selector.

## Outcome

The navigation rail is fully native to the convergent register: tokened,
Lucide-only, theme-correct, with a roving toolbar, instant keyboard camera
actions (the emitted zoom/reset SceneCommands are non-animating at the seam, so
the keyboard and pointer paths dispatch the same instant command — no new seam
member), honest time-travel and degraded states, and the layer-ownership boundary
preserved unbroken (camera intent flows one way through `SceneController.command`,
granularity is a stores write, degradation is read through a stores selector, no
fetch, no node shape, no raw `tiers`). Forty frontend tests across the three
touched specs pass; eslint, tsc, and prettier are clean on every touched file.

## Notes

- The full `just dev lint frontend` gate is RED project-wide, but exclusively on
  concurrent agents' uncommitted files for the sibling phases (the P07 command-
  palette `CommandPalette.tsx`/its tests, and the P08 `searchFallback.test.ts`):
  a missing `react-hooks/exhaustive-deps` registration and several unused-symbol
  TS6133/TS6196 errors. None are in this step's scope; per the concurrency
  guidance the gate was re-run once and the failures confirmed stable and outside
  the touched files. eslint, tsc, and prettier were verified clean on every file
  this step authored (`NavToolbar.tsx`, `NavToolbar.render.test.tsx`,
  `NavToolbar.test.ts`, `queries.ts`, `queries.test.ts`).
- Keyboard camera-command BINDINGS (global shortcuts) are deliberately deferred:
  the ADR sanctions them but pins the exact bindings as a plan detail routed
  centrally through the command palette (P07) to avoid collisions; this step
  delivers the in-toolbar keyboard contract (roving walk + native button
  activation) and leaves the global bindings to the palette phase, consistent with
  the ADR's "surface through the command palette as the discoverable home".
- ADR sufficiency: no insufficiency found. The ADR's claim that the surface
  "adds no new seam member" held — the existing zoom/reset SceneCommands are
  already instant at the field, so the motion law's "keyboard-initiated actions
  feel instant" is satisfied without a seam change. One minor refinement worth
  noting for the reviewer: the ADR names a loading/degraded affordance on the
  descent but the live graph-slice query had no stores-side availability selector
  (only the vault-tree did); this step added the parallel `GraphSliceAvailability`
  selector so the affordance reads derived truth, matching the sidebar's pattern.

### Revision 1 (design-review PASS-WITH-REVISIONS, one HIGH + one recommended)

- HIGH — roving Tab-stop dead state. The active roving member (`activeRove`) was
  not reconciled when its control became disabled: focusing the `feat`/`docs`
  segment then engaging time-travel left `tabIndex 0` on a now-disabled segment,
  removing it from the tab order and leaving the rail with ZERO reachable Tab
  stops until a click. Fixed with a reconciliation `useEffect` keyed on the
  disabling conditions (`timeTravelling`, `isFullscreen`, `activeRove`): when no
  enabled roving control holds the Tab stop, the active member snaps back to
  index 0 (zoom-out, always live). A render test focuses `docs`, flips to
  time-travel, and asserts the disabled segment drops the Tab stop while exactly
  one enabled control (zoom-out) carries `tabIndex 0` — a Tab stop always
  survives.
- Recommended — the descent's degraded reason was exposed only via the
  mouse-only group `title`. Added a visually-quiet `role=status` /
  `aria-live=polite` region (`#nav-granularity-status`) the group's
  `aria-describedby` points at, carrying the degraded reason, the time-travel
  lock, and the loading state in copy tone — consistent with the camera level's
  `role=status`. Two render tests assert the non-visual announcement for the
  degraded-reason and time-travel cases.
- Recommended — confirmed (no change): `ICON_PX = 13` is the intentional
  attenuated chrome size (below the iconography ADR's 14px domain-mark gate,
  matching SearchTab's 13px chrome). The marks render in `text-ink-faint`
  `currentColor`, which clears the iconography ADR's >=3:1 non-text floor in every
  theme per the styles.css contrast proof (ink-faint/paper 4.13 light / 3.89 dark
  / 8.18 HC), and the simple Lucide chrome silhouettes (minus / plus / rotate /
  maximize) stay squint-distinct at 13px on the warm ground.
- Cleared items left untouched: instant keyboard camera actions, the stores
  availability selector + tiers-seam degradation, ARIA toolbar / aria-pressed /
  non-color state, token discipline.
- Gate after revision: eslint + prettier + tsc clean on every touched file (the
  full `just dev lint frontend` remains RED only on concurrent agents' P08
  `SearchTab.tsx` mid-refactor — `registerRow`/`moveFocus` rename — outside this
  step's scope); stage + queries suites green (77 tests, incl. the 25 NavToolbar
  cases).
