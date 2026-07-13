---
tags:
  - '#adr'
  - '#mobile-responsive-layout'
date: '2026-06-22'
modified: '2026-07-12'
related:
  - '[[2026-06-22-mobile-responsive-layout-research]]'
---

# `mobile-responsive-layout` adr: `mobile responsive layout` | (**status:** `accepted`)

## Problem Statement

The dashboard has no responsive behaviour. The shell is a fixed desktop grid
(`appShellGridColumns` → `"300px 1fr 320px"`, applied as an inline
`gridTemplateColumns` on a `grid h-screen` root), and the only width-aware media
query in the whole frontend is `prefers-reduced-motion`. Below ~640px the two
rails (620px) overflow and crush the stage. Compounding this, the layout's own
dimensions are **hardcoded px that evade the project's px guard** (bare JS numbers
composed into px at runtime inside a `.ts` file the scanner never walks — see
research F10), so the responsive work must also be a **proper layout
consolidation**, not just a breakpoint bolt-on.

This ADR settles the architecture for a compact, touch-first layout: at small
viewports the three-column shell collapses to **one surface at a time, chosen by a
thumb-reachable tab bar**, the left rail is dropped, documents open full-screen via
a **sliding push/pop navigation** (no docking), the graph is **not navigable**, the
timeline degrades to a **scrubber-only minimode**, and the left rail's browse /
filter / search functions are rehomed without breaking the canonical-surface and
portal-pin guarantees. It is a new feature framed by
`[[2026-06-22-mobile-responsive-layout-research]]`. **Design-first is a hard gate:
the compact frames are designed in the binding Figma file and user-approved before
any code is written.**

## Considerations

- **The layout is already a stores-derived projection.** `useShellFrameView` emits
  a `ShellFrameView` that the dumb `AppShell` renders; a responsive mode is an
  additional *input* to that projection, not a parallel shell.
- **Layout dimensions are un-guarded px.** The rail-width / timeline-height /
  collapsed-width / key-step constants are bare numbers stringified to px at the
  grid seam; `scan-px.mjs` scans only `.css`/`.tsx` for a literal `px`, so they
  pass the letter of `no-hardcoded-px-in-dom-styling` while violating its spirit
  (research F10). Reworking the grid is the moment to consolidate them.
- **One canonical filter surface.** `filtering-has-one-canonical-surface` + its
  guard lock the filter to `app/left/`; the railless layout re-presents, not
  re-authors, it.
- **The graph canvas is portal-pinned.** `graph-canvas-is-portal-pinned-never-reparented`
  forbids moving the canvas DOM node.
- **The command palette is already a three-plane overlay** — the natural search
  home on a railless layout.
- **The sizing foundation is relative** (`no-hardcoded-px-in-dom-styling`,
  `uiScale()`), so touch targets and bar heights need no px literals.
- **Layer law.** `dashboard-layer-ownership` and
  `view-rewrite-preserves-the-state-and-scene-contract`: consume the existing
  stores hooks and `SceneController` contract unchanged — no new fetch, model, raw
  `tiers`, or engine change.

## Constraints

- **Design-first gate (blocking).** `figma-is-the-binding-source-of-truth`; the
  binding file `SlhonORmySdoSMTQgDWw3w` has only desktop AppShell frames (`117:2`,
  `384:1004`, 1472×940) — no compact frames (research F8). **No responsive code is
  written until the compact frames (per-surface, see D2) are authored in the
  binding file AND user-approved. This is the first design priority once this ADR
  is settled.** The ADR records the architecture; the frames are the binding spec
  the code mirrors.
- **No new responsive library.** Mechanism is `matchMedia` + the existing
  projection; no breakpoint/grid library is introduced.
- **Graph on low-power devices** is sidestepped, not solved: compact makes the
  graph non-navigable (D4), so GPU/touch cost is not on the critical path.
- **Parent-feature stability.** Builds on mature shipped seams (shell projection,
  portal pin, three-plane palette, filter store, relative-units foundation,
  dashboard-state); none is frontier.

## Implementation

**D1 — One viewport-class signal, fed into the existing projection.** Add a single
`matchMedia`-backed hook in `frontend/src/stores/view/` (`useViewportClass()` →
`"compact" | "regular"`) keyed on one breakpoint constant (≈640px / `40rem`). Feed
it into `deriveShellFrameView`/`useShellFrameView` so the SAME projection emits
either the three-column grid (regular) or the compact single-surface + tab-bar
frame. The chrome stays dumb; no second component tree. Pure-CSS is rejected (can't
restructure the React tree, can't suppress the graph).

**D1b — Layout-dimension consolidation (the px cleanup).** Route the shell's
dimensional constants (rail widths, timeline height, collapsed width, key step,
resize-handle offsets, and the new breakpoint) onto the rem/token scale — a typed
dimensional token set consumed at the single grid-string/style seam — so the
layout sizes track UI scale like the rest of the DOM, and **close the guard's blind
spot** (extend `scan-px.mjs` to cover `.ts` layout modules and runtime `${n}px`
composition, or assert the dimensions are tokenized). This lands as part of the
responsive grid rework, not a separate campaign.

**D2 — Compact IA: a bottom tab bar over one surface, designed per element.** On
compact, the grid is replaced by one content surface plus a thumb-reachable bottom
tab bar. Surfaces are projections of the existing regions
(`views-are-projections-of-one-model`): **Browse** (left-rail vault/tree/code
content — the landing) · **Documents** (the reader, reached via D5 sliding) ·
**Timeline** (minimode, D2t) · **Status** (right-rail `StatusTab`) · **Search**
(palette full-screen, D3); **Graph** is present only as a non-navigable surface
(D4). *Addendum (per the feedback): each visual element gets its own explicit
compact treatment in the design frames* — not just the shell. The design phase
must produce compact frames for: the Browse surface, the document reader
(full-screen), the filter bottom sheet, the full-screen search palette, the
timeline minimode, the StatusTab, context menus (touch), the settings dialog, and
the bottom tab bar itself.

**D2t — Timeline minimode.** On compact the timeline drops its lane/event
visualization entirely and presents **only the draggable timeline control** (the
scrubber/playhead) — a compact temporal navigator, not the full lineage strip. It
is its own surface (or a slim persistent control), not a resizable footer; resize
handles are suppressed on compact.

**D3 — Filter and search without a left rail.** The filter stays authored in
`app/left/` (guard intact) but is *presented* in a bottom sheet triggered from
Browse, reusing `setFilterSidebarOpen`. Search is the existing three-plane palette
opened full-screen — no new search surface.

**D4 — Graph is not navigable on compact.** The compact layout offers no
interactive graph. The Graph surface, if shown at all, is a static/non-interactive
overview; the live WebGL canvas is **not mounted on a cold compact load** (saving
GPU), and on a runtime shrink from desktop it is **hidden, never re-parented or
destroyed** (portal-pin contract preserved for a later widen). Whether Graph
remains a tab or is demoted entirely is a design-frame decision.

**D5 — Sliding document navigation (replaces docking on compact).** No dockview,
no tabs-with-panels, no splits, no floats on compact. Documents open **full-size,
full-screen, one at a time** through a horizontal **slide-stack (push/pop)**: the
Browse surface (list / tree / search results) is the base "main"; selecting a
result **automatically slides the full-screen reader in** over the base; a back
gesture (edge swipe) **slides it away** to return. This composes with the bottom
tab bar (the bar selects the active surface; within Browse the slide-stack handles
list→document→back), reuses the preserved `openDocTab`/open-island intent, and
mounts no dock workspace. Exact gesture direction, animation, and multi-document
history depth are pinned in the design frames.

**D6 — Touch sizing + view-local active surface.** Min ~44px (`2.75rem`) touch
targets, bar heights, and safe-area insets on the `fg-*` rem scale (no px
literals). The active compact surface and slide-stack position are transient
presentation, so they live view-local in `viewStore`, orthogonal to the
collapse/`right_tab` dashboard-state, and are ignored on regular viewports.
Hover-only affordances (context menus) gain a long-press / overflow path.

This is view-layer + one stores signal + a dimensional-token consolidation only:
no engine change, no new wire, no new model.

## Rationale

The research shows the layout is already a clean projection with a single inline
grid as its only desktop assumption (F1, F2), so making the projection
viewport-aware (D1) is cheaper and safer than forking a second shell, and it keeps
`dashboard-layer-ownership` intact. F10 turned the user's "hardcoded pixels"
observation into a precise finding — the dimensions evade the guard — which D1b
folds into the same grid rework. F3 maps each region to a compact surface (D2), and
the per-element addendum reflects that a faithful mobile UI is designed
surface-by-surface, which is also why D8/the design-first gate is hard. F5's
graph render-cost caution becomes D4 (non-navigable graph) given the user's
direction. F6 (dockview is desktop-only) is resolved by D5's sliding model rather
than a shrunken dock. The timeline minimode (D2t) follows from the strip being a
wide-pointer visualization whose only essential mobile function is temporal
scrubbing. F4/F7 keep the filter guard and the rem foundation intact (D3, D6).

## Consequences

- **Gains.** Usable on phones/tablets; one set of stores/scene contracts serves
  both form factors (one code path, two frames). The palette and StatusTab carry
  over almost unchanged. The px consolidation (D1b) also benefits desktop UI-scale
  coherence and removes a standing guard blind spot.
- **Difficulties.** The slide-stack navigation (D5) is new interaction surface
  area (gesture, history, animation) and must be designed before it is built. The
  graph's mounted-vs-hidden lifecycle across a runtime resize (D4) needs live
  verification against the portal-pin rule. Touch equivalents for hover/context
  interactions add work per surface.
- **Pitfalls.** Re-authoring the filter outside `app/left/` trips the guard;
  re-parenting the canvas blanks the graph; consolidating dimensions by snapping
  to a nearer token (vs value-preserving rem) would drift the binding design.
- **Pathways opened.** The viewport-class signal enables a future tablet/medium
  tier and a user "compact UI" preference; the dimensional token set pairs with
  `uiScale()` for one global sizing story; the slide-stack is reusable for any
  future full-screen drill-in.

## Codification candidates

- **Rule slug:** `responsive-layout-is-one-viewport-aware-projection`.
  **Rule:** Responsive/adaptive layout is decided by one viewport-class signal fed
  into the single shell projection (`stores/view`), which emits the frame shape for
  dumb chrome; no surface forks a parallel mobile component tree, re-parents the
  portal-pinned graph canvas to change layout, or re-authors a canonical surface
  (filter, search) to expose it on compact.
- **Rule slug:** `layout-dimensions-are-tokenized-not-raw-px`.
  **Rule:** Shell/layout dimensional constants (rail widths, panel heights,
  breakpoints, handle offsets) are authored on the rem/token scale, never as bare
  numbers stringified to px at a style seam, and the px guard covers the `.ts`
  layout modules and runtime `${n}px` composition that compute them.
  *(Both are candidates only — promote per the codify discipline after they hold
  across a full execution cycle, not on first encounter.)*
