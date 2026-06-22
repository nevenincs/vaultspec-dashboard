---
tags:
  - '#research'
  - '#mobile-responsive-layout'
date: '2026-06-22'
modified: '2026-06-22'
related:
  - '[[2026-06-22-mobile-responsive-layout-adr]]'
---

# `mobile-responsive-layout` research: `mobile responsive layout`

The dashboard has no notion of a small viewport. The shell renders a fixed
three-column desktop grid at full viewport height with no breakpoint logic
anywhere in the frontend. This document maps the current layout architecture,
the heavy/desktop-only surfaces, and the project rules a responsive rebuild must
respect, then frames the design space for a compact (phone/tablet) layout: a
single-pane, tabbed, touch-first shell that drops the left rail and rehomes its
search and filter functions without breaking the canonical-surface guards.

## Findings

### F1 — The shell is a fixed desktop grid; there is zero responsive logic today

The app shell is one CSS grid whose template columns are computed by a pure
function `appShellGridColumns` in `frontend/src/stores/view/shellLayout.ts` and
applied as an inline `gridTemplateColumns` style on the root in
`frontend/src/app/AppShell.tsx`. The default is literally `"300px 1fr 320px"`
(left rail · stage · right rail), the root is `grid h-screen`, and the only
adaptivity is the user manually collapsing/hiding a rail (`leftRailVisible`,
`leftCollapsed`, `rightCollapsed`, `timelineVisible`) or dragging a resize
handle. The column widths are px-clamped to desktop bands
(`LEFT_RAIL_MIN_WIDTH`/`MAX`, `RIGHT_RAIL_*`, `TIMELINE_*`).

A repository-wide search for `@media`, `min-width`, `max-width`,
`@custom-media`, `--breakpoint`, and Tailwind `screens` returns **exactly one
width-independent media query in the whole frontend**: `@media
(prefers-reduced-motion: reduce)` at `frontend/src/styles.css:504`. There are no
width breakpoints, no Tailwind responsive prefixes in use, and no `screens`
config. The only place that reads a viewport width at all is the timeline, which
measures *its own* rendered width via a `ResizeObserver` for its scroll/zoom math
(`TimelineControls`) — not for layout restructuring.

Consequence on a phone (≈375–430px CSS px): `300 + 320 = 620px` of rails alone
exceed the viewport, so the `1fr` stage collapses toward zero and the page
overflows horizontally. The UI is structurally desktop-only.

### F2 — The layout is already a clean stores-derived projection (the seam to exploit)

The shell is leaf chrome that renders state, per `dashboard-layer-ownership` and
`view-rewrite-preserves-the-state-and-scene-contract`. `useShellFrameView(scope)`
in `shellLayout.ts` composes view-local layout state (`useShellLayoutState`,
backed by `viewStore`) with backend dashboard-state
(`useDashboardShellChromeView`) and derives a `ShellFrameView` — `gridColumns`,
every `*ClassName`, the `show*` booleans, and the panel-control labels. `AppShell`
consumes that view and renders dumb `<aside>`/`<main>`/`<footer>` slots. This is
the load-bearing fact for the rebuild: **a responsive mode can be introduced by
feeding a viewport signal into the existing projection** so it emits a different
frame shape (single-pane + tab bar vs three-column grid). The chrome stays dumb;
no fetch, no model, no raw `tiers` is added (the layer law and the
view-rewrite-preserves-the-contract rule both hold).

The collapse/active-tab state lives in backend dashboard-state (`panelState`,
`right_tab`); rail widths/timeline height/visibility live view-local in
`viewStore`. A compact layout introduces an orthogonal *viewport class*, not a
new copy of any of these.

### F3 — The surfaces and how they'd map to a compact, tabbed shell

Current desktop regions and their content:

- **Left rail** (`frontend/src/app/left/`, `LeftRail`): browse modes
  (vault / tree / code via `browserMode` + `IconRail`) **and** the one canonical
  filter surface (`FilterSidebar`/`FilterMenu` flyout). This is the rail the user
  wants dropped on mobile.
- **Stage** (`frontend/src/app/stage/`, `DockWorkspace`): the portal-pinned WebGL
  graph canvas plus document panels opened as dockview tabs/splits/floats.
- **Timeline** (`frontend/src/app/timeline/`): a horizontal pan/zoom event strip
  in a resizable footer.
- **Right rail** (`frontend/src/app/right/`, `StatusTab`): already retired to ONE
  scrollable surface — location header, a Changes fold, open work, GitHub items,
  recent commits (the three Status/Changes/Search tabs were collapsed; semantic
  search moved to the palette).
- **Command palette** (`frontend/src/app/palette/`): already a full-overlay with
  THREE planes — `command` (verbs/nav), `search` (rag semantic), `document`
  (literal rag-free finder). This is the most mobile-ready surface and the natural
  home for "search functions" on a railless layout.

A compact single-pane shell maps each region to a tab (or an overlay): a primary
**Browse** surface (the left rail's vault/tree/code content), **Graph**,
**Timeline**, **Status** (the right rail), and **Search** (the palette, opened
full-screen). "Right-rail-only" in the user's framing generalizes to "one pane at
a time, chosen by a thumb-reachable tab bar," with documents/browse as the
landing rather than the graph.

### F4 — Filtering is guard-locked to `app/left/`; mobile must rehome the presentation, not the authorship

`filtering-has-one-canonical-surface` makes the left rail's filter area the SOLE
author of `dashboardState.filters`, and `filterConsolidation.guard.test.ts`
**fails the build** if `FilterSidebar`/`FilterMenu`/`FacetRow`/`toggleFacet` is
mounted anywhere but `app/left/`. So a railless mobile layout cannot move the
filter controls into a new module — it must keep them authored in `app/left/` and
present that same component inside a bottom sheet / drawer triggered from the
compact Browse surface. The filter store seam (`filterSidebar.ts`,
`setFilterSidebarOpen`, `deriveFilterSidebarMenuSections`) already models an
open/closed flyout, which a sheet can reuse directly.

### F5 — The graph canvas is the hardest mobile constraint (portal-pin + GPU cost)

`graph-canvas-is-portal-pinned-never-reparented` forbids ever moving the
`<canvas>` DOM node to a new parent — doing so destroys the WebGL context and the
live `SceneController`. The canvas is mounted once for the app's lifetime in a host
that is a *sibling* of the dock container; dockview only owns an empty placeholder
the rect-bridge tracks. A tabbed mobile shell therefore must **hide** the graph
host (visually, e.g. off-screen/`display:none` of the host, or a placeholder the
bridge tracks) when a non-graph tab is active — never unmount or re-parent it.
`graph-compute-is-cpu-gpu-is-render-and-search` and
`graph-queries-are-bounded-by-default` already keep the payload bounded; the
mobile concern is render cost and touch input, not data volume. Three-native
camera nav (pan/zoom/fit, node hover/select/drag/pin) already exists and is
pointer-based, so pinch/drag is largely there — but the graph should not be the
default compact tab.

### F6 — DockWorkspace and the timeline are desktop interaction paradigms

The dock workspace (tabbable/movable/floating document panels) assumes a wide
pointer-driven canvas. On compact, documents should open **full-screen, one at a
time** (single-pane), with a simple back/close and a lightweight tab switcher,
rather than as dockable splits. The portal-pin contract still holds (the graph
placeholder is tracked; documents are the other pane). The timeline's horizontal
pan/zoom strip works on touch but belongs as its own full-screen tab on compact,
not a resizable footer (resize handles are pointer-only and should be suppressed
on compact).

### F7 — The sizing foundation is already relative; touch sizing is expressible

`no-hardcoded-px-in-dom-styling` already drove the whole DOM onto a rem scale at a
16px basis (the `fg-*` token utilities), enforced by `lint:px` with an empty
allowlist, and the scene bridges screen-px through `uiScale()`. So min touch
targets (≈44px → `2.75rem`), bottom-bar heights, and safe-area spacing are all
expressible on the existing token scale without reintroducing px literals. A
responsive rebuild does not fight the sizing system — it extends it (a breakpoint
constant, possibly a compact spacing/touch token step).

### F8 — Figma has NO mobile frames; this is a binding-source-of-truth gap

`figma-is-the-binding-source-of-truth` makes the Figma file
`SlhonORmySdoSMTQgDWw3w` binding, and `frontend/figma/FRAMES.md` records that the
ONLY full-shell binding screens are the desktop `AppShell` frames `117:2`
(graph-only) and `384:1004` (dock workspace) — both 1472×940. There are **no
compact/phone frames**. A mobile layout is therefore either (a) a deliberate,
ADR-recorded accepted deviation, or (b) must be designed in the binding Figma file
first and then mirrored in code. For a *design* campaign the design-first path is
the right one: author compact frames in the binding file, then build to them; the
ADR records the interim deviation until those frames land.

### F9 — Prior art: no responsive research exists; nearest neighbors are the rail/state cycles

A vault search for mobile/responsive/breakpoint/adaptive returns no prior
responsive work — only tangential hits (timeline viewport math, the minimap, the
relative-units migration). The relevant precedents are architectural, not
responsive: the `filter-consolidation` cycle (one canonical filter surface), the
`dashboard-state-centralization` cycle (shared intent through dashboard-state),
the `editor-dock-workspace` cycle (the portal-pin contract), the
`command-palette-architecture` cycle (the three-plane overlay), and the
`relative-units-migration` cycle (the rem/`uiScale` foundation). The responsive
campaign composes over all of these rather than re-architecting them.

### F10 — The layout dimensions ARE hardcoded px, but they escape the px-scan guard

`no-hardcoded-px-in-dom-styling` is enforced by `frontend/scripts/scan-px.mjs`,
whose detector is `PX_RE = /\b\d*\.?\d+px\b/` run only over files matching
`/\.(css|tsx)$/`. The shell's layout dimensions slip through both halves of that
net: they are stored as **bare JS numbers** with no `px` substring
(`LEFT_RAIL_MIN/MAX/DEFAULT_WIDTH = 180/420/252`, `RIGHT_RAIL_* = 220/420/290`,
`TIMELINE_* = 120/360/212` in `viewStore.ts`; `LEFT_RAIL_COLLAPSED_WIDTH = 48` and
`SHELL_PANEL_KEY_STEP = 16` in `shellLayout.ts`), and they are composed into px
only at runtime — `appShellGridColumns` returns `` `${n}px 1fr ${n}px` `` and
`timelineStyle: { height: \`${n}px\` }` — inside `shellLayout.ts`, a **`.ts` file
the scanner never walks** (it scans `.css`/`.tsx` only). The resize-handle offsets
(`right-[-3px]`, `top-[-3px]`) live in the same `.ts` file and are likewise
unscanned. So the layout is genuinely px-hardcoded in violation of the *spirit* of
the rule while passing its *letter*. A responsive rebuild that reworks the grid is
the right moment to consolidate these onto the rem/token scale (or a typed
dimensional token set) and to close the guard's `.ts`/runtime-composition blind
spot. This is the "proper layout consolidation" the responsive work must absorb,
not a separate cleanup.

## Open questions for the ADR

1. **Breakpoint mechanism** — JS viewport-class signal fed into the existing
   shell projection (restructures the React tree, can hide the graph) vs pure CSS
   (cannot restructure or unmount). Recommended: a single `matchMedia`-backed
   viewport-class hook in `stores/view`, one breakpoint constant.
2. **Compact information architecture** — which tabs, and which is the landing
   (recommended: Browse/documents, not Graph).
3. **Filter/search exposure without a rail** — filter authored in `app/left/`,
   presented in a bottom sheet; search via the existing full-screen palette.
4. **Graph tab lifecycle** — keep the canvas mounted-but-hidden off the graph tab
   to honor the portal-pin contract.
5. **State ownership of the active compact surface** — view-local ephemeral chrome
   vs shared dashboard-state.
6. **Figma deviation** — author compact frames in the binding file as part of the
   campaign vs ship the responsive structure as an ADR-recorded interim deviation.
