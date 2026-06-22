---
tags:
  - '#adr'
  - '#mobile-responsive-layout'
date: '2026-06-22'
modified: '2026-06-22'
related:
  - '[[2026-06-22-mobile-responsive-layout-research]]'
---

# `mobile-responsive-layout` adr: `mobile responsive layout` | (**status:** `proposed`)

## Problem Statement

The dashboard has no responsive behaviour. The shell is a fixed desktop grid
(`appShellGridColumns` → `"300px 1fr 320px"`, applied as an inline
`gridTemplateColumns` on a `grid h-screen` root), and the only width-aware media
query in the whole frontend is `prefers-reduced-motion`. On any viewport narrower
than roughly 640px the two rails alone (620px) overflow the screen and crush the
stage. This ADR settles the architecture for a compact, touch-first responsive
layout: at small viewports the three-column shell collapses to a **single pane at
a time, chosen by a thumb-reachable tab bar**, the left rail is dropped, and its
browse / filter / search functions are rehomed without breaking the project's
canonical-surface and portal-pin guarantees. It is a new feature, motivated
directly by the absence of any mobile mode and framed by the research
`[[2026-06-22-mobile-responsive-layout-research]]`.

## Considerations

- **The layout is already a stores-derived projection.** `useShellFrameView`
  composes view-local layout state with backend dashboard-state and emits a
  `ShellFrameView` (grid columns, class names, `show*` booleans) that the dumb
  `AppShell` renders. A responsive mode is therefore an *additional input* to that
  projection, not a parallel layout system.
- **One canonical filter surface.** `filtering-has-one-canonical-surface` and its
  guard test lock `FilterSidebar`/`FilterMenu`/`FacetRow`/`toggleFacet` to
  `app/left/`. The railless layout must re-present, not re-author, the filter.
- **The graph canvas is portal-pinned.** `graph-canvas-is-portal-pinned-never-reparented`
  forbids moving the canvas DOM node. A tabbed shell must hide it when off the
  graph tab, never unmount or re-parent it.
- **The command palette is already a three-plane overlay.** Search (semantic +
  literal document finder) and command/navigation already live in one full-screen
  overlay — the natural search home for a railless layout.
- **The sizing foundation is relative.** `no-hardcoded-px-in-dom-styling` gives a
  rem token scale and a `uiScale()` scene bridge, so touch targets and bar heights
  are expressible without px literals.
- **Layer law.** `dashboard-layer-ownership` and
  `view-rewrite-preserves-the-state-and-scene-contract` require the rebuild to
  consume the existing stores hooks and `SceneController` contract unchanged — no
  new fetch, no new model, no raw `tiers`, no engine change.

## Constraints

- **Figma binding gap (blocking for design-faithful build).** The binding file
  `SlhonORmySdoSMTQgDWw3w` has only the desktop AppShell frames (`117:2`,
  `384:1004`, 1472×940) — no compact frames. `figma-is-the-binding-source-of-truth`
  requires either authoring compact frames in the binding file first, or recording
  this layout as an accepted, named deviation in this ADR. **Decision: do both** —
  ship the responsive *structure* as an ADR-recorded interim deviation, and author
  binding compact frames during the campaign so code converges onto them.
- **No new responsive library.** The mechanism is `matchMedia` + the existing
  projection; no breakpoint/grid library is introduced (verify established usage
  before reaching for one).
- **Graph render cost on low-power devices** is the real risk, not data volume
  (queries are already bounded). Mitigated by making Browse, not Graph, the
  compact landing and by keeping the canvas hidden off-tab.
- **Parent-feature stability.** This builds entirely on mature, shipped seams —
  the shell projection, the dock workspace + portal pin, the three-plane palette,
  the filter store, the relative-units foundation, dashboard-state. All have held
  across multiple completed cycles; none is frontier.

## Implementation

**D1 — One viewport-class signal, fed into the existing projection.** Add a single
`matchMedia`-backed hook in `frontend/src/stores/view/` (e.g.
`useViewportClass()` → `"compact" | "regular"`) keyed on one breakpoint constant
(proposed ≈ 640px / `40rem`, the desktop floor below which the two rails cannot
coexist). Feed that class into `deriveShellFrameView`/`useShellFrameView` so the
SAME projection emits either the three-column grid (regular) or a single-pane +
tab-bar frame (compact). The chrome stays dumb; no second layout component tree is
created. A pure-CSS approach is rejected because it cannot restructure the React
tree (tabs vs columns) nor hide the heavy graph.

**D2 — Compact information architecture: a bottom tab bar over one pane.** On
compact, the grid is replaced by a single content pane plus a thumb-reachable
bottom tab bar. Tabs are projections of the existing surfaces
(`views-are-projections-of-one-model`): **Browse** (the left rail's vault/tree/code
content — the landing), **Graph**, **Timeline**, **Status** (the right rail's
`StatusTab`). **Search** is a persistent affordance (a tab or a top-bar button)
that opens the existing command palette full-screen. "Right-rail-only" generalizes
to "one pane at a time"; documents/browse is the default, not the graph.

**D3 — Filter and search exposure without a left rail.** The filter stays authored
in `app/left/` (guard intact) but is *presented* in a bottom sheet / drawer
triggered from the compact Browse surface, reusing the existing
`setFilterSidebarOpen` open/close seam. Search uses the existing three-plane
palette opened full-screen — no new search surface is minted.

**D4 — Graph tab honours the portal-pin contract.** The app-lifetime canvas host
stays mounted; on compact it is shown only when the Graph tab is active and
hidden (host `display:none` / off-screen, or a tracked placeholder) otherwise.
The canvas is never unmounted or re-parented; the rect-bridge tracks whatever
placeholder the active layout exposes.

**D5 — Documents open single-pane on compact.** The dockview tab/split/float
paradigm is desktop-only; on compact a document opens full-screen (one at a time)
with a back/close and a lightweight switcher, through the preserved `openDocTab`
intent. Resize handles and rail drag are suppressed on compact.

**D6 — Active-compact-surface state is view-local ephemeral chrome.** The selected
compact tab is transient presentation, so it lives view-local in `viewStore`
(like rail widths), orthogonal to the existing collapse/`right_tab`
dashboard-state. It is ignored on regular viewports.

**D7 — Touch sizing on the existing token scale.** Min ~44px (`2.75rem`) touch
targets, bar heights, and safe-area insets are authored on the `fg-*` rem scale;
no px literals (`lint:px` stays green). Hover-only affordances (context menus) gain
a long-press / overflow-button path on compact.

**D8 — Design-first Figma convergence.** Author compact binding frames (shell with
bottom tab bar, Browse, single-pane document, filter sheet, full-screen search)
in `SlhonORmySdoSMTQgDWw3w`; code mirrors them. Until they land, this ADR is the
record of the accepted interim deviation.

This is view-layer + one stores-layer signal only: no engine change, no new wire,
no new model, preserving `view-rewrite-preserves-the-state-and-scene-contract`.

## Rationale

The research (F1, F2) shows the layout is already a clean projection with a single
inline grid as its only desktop assumption, so the cheapest correct lever is to
make the projection viewport-aware rather than fork a second shell — this keeps
`dashboard-layer-ownership` intact and avoids a parallel mobile codebase. F3 maps
each desktop region cleanly onto a tab, and F4/F5 establish the two hard fences
(filter authored only in `app/left/`; canvas never re-parented) that the bottom
sheet (D3) and the hidden-not-unmounted graph host (D4) are designed precisely to
respect. F6 motivates single-pane documents over dockview on compact; F7 shows the
rem foundation already supports touch sizing; F8 names the Figma gap that D8 and
the Constraints section resolve as a recorded deviation. Choosing Browse over Graph
as the landing (D2) follows F5's render-cost caution.

## Consequences

- **Gains.** The dashboard becomes usable on phones/tablets; the same stores and
  scene contracts serve both form factors (one code path, two frames), so features
  do not fork. The palette and StatusTab — already overlay/single-surface — carry
  over almost unchanged.
- **Difficulties.** The graph tab's mounted-but-hidden lifecycle is the subtle
  part; getting the rect-bridge to track a hidden/placeholder host without context
  loss needs live verification (the portal-pin rule is unforgiving). Context menus
  and resize-only interactions need touch equivalents.
- **Pitfalls.** Re-authoring the filter outside `app/left/` would trip the
  consolidation guard; re-parenting the canvas into a tab panel would blank the
  graph. Both are explicitly designed around. A naive CSS-only attempt would leave
  the graph and dockview rendering full-cost under a crushed pane.
- **Pathways opened.** A viewport-class signal in the projection also enables a
  future tablet/medium tier and a user "compact UI" preference, and pairs with the
  existing `uiScale()` for a coherent global sizing story.

## Codification candidates

- **Rule slug:** `responsive-layout-is-one-viewport-aware-projection`.
  **Rule:** Responsive/adaptive layout is decided by one viewport-class signal fed
  into the single shell projection (`stores/view`), which emits the frame shape for
  dumb chrome; no surface forks a parallel mobile component tree, re-parents the
  portal-pinned graph canvas to change layout, or re-authors a canonical surface
  (filter, search) to expose it on compact.
  *(Candidate only — promote per the codify discipline after it has held across a
  full execution cycle, not on first encounter.)*
