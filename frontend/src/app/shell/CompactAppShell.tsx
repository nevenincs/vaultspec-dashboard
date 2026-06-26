// The compact (phone/tablet) shell (mobile-responsive-layout ADR D2). When the
// viewport is compact, the AppShell renders THIS instead of the desktop
// three-column grid: a single pane at a time — chosen by the bottom tab bar —
// under a mobile top bar. It is the compact branch of the ONE shell projection
// (responsive-layout-is-one-viewport-aware-projection), not a parallel app.
//
// Surfaces (ADR D2): Browse (the left-rail vault/files content — the landing),
// Graph (NON-navigable on compact, D4), Timeline (minimode, D2t — filled by a
// later step), Status (the activity rail). Search is the momentary tab that opens
// the full-screen command palette (D3). Documents open via the sliding navigator
// (D5) — wired in a later step.
//
// Layer law (dashboard-layer-ownership / view-rewrite-preserves-the-contract):
// composes the existing surfaces and the mobile primitives, consuming the
// preserved stores hooks unchanged. The heavy WebGL graph canvas is NOT mounted
// here (ADR D4 — not mounted on a cold compact load), so the dock workspace is
// absent from this branch.

import { useEffect, useRef } from "react";

import { useActiveScope } from "../../stores/server/queries";
import { setCompactSurface, useCompactSurface } from "../../stores/view/compactSurface";
import { openSearchPalette } from "../../stores/view/commandPalette";
import {
  toggleFilterSidebar,
  useFilterSidebarOpen,
} from "../../stores/view/filterSidebar";
import { setTimelinePlayhead } from "../../stores/view/timeline";
import { Button } from "../kit";
import { Funnel, MagnifyingGlass, TreeStructure } from "../kit/glyphs";
import { LeftRail } from "../left/LeftRail";
import { StatusTab } from "../right/StatusTab";
import { BottomTabBar, type CompactSurface } from "./BottomTabBar";
import { CompactDocReader } from "./CompactDocReader";
import { CompactTimeline } from "./CompactTimeline";
import { MobileTopBar } from "./MobileTopBar";

const SURFACE_TITLE: Record<string, string> = {
  browse: "Browse",
  graph: "Graph",
  timeline: "Timeline",
  status: "Status",
};

/** Graph is not navigable on compact (ADR D4): an honest, non-interactive state
 *  with a fallback to the document browse surface. */
function GraphUnavailable() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-fg-3 px-fg-8 text-center">
      <span className="flex size-[4.5rem] items-center justify-center rounded-fg-pill bg-accent-subtle text-ink-faint">
        <TreeStructure size={34} />
      </span>
      <h2 className="text-title text-ink">The graph isn’t available on mobile</h2>
      <p className="text-body text-ink-muted">
        The constellation needs a larger screen and a pointer. Open the dashboard on a
        desktop to explore it.
      </p>
      <Button variant="primary" onClick={() => setCompactSurface("browse")}>
        Browse documents
      </Button>
    </div>
  );
}

export function CompactAppShell() {
  const surface = useCompactSurface();
  const scope = useActiveScope();
  const filterOpen = useFilterSidebarOpen();
  const mainRef = useRef<HTMLElement>(null);

  // Place initial focus on the pane once on mount so the compact page never loads
  // with focus on `<body>` (the APG always-have-a-focused-element floor; parity
  // with the desktop shell). The skip link stays the first Tab stop.
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, []);

  const onSelect = (next: CompactSurface) => {
    if (next === "search") {
      openSearchPalette();
      return;
    }
    setCompactSurface(next);
  };

  // Browse's top bar is the worktree name + search + advanced-filter (binding Figma
  // compact Browse: the worktree header + filter fold into the top bar). Other
  // surfaces show their title only — search is reached via the bottom Search tab, and
  // the binding Status/Timeline/Graph frames carry no top-bar action.
  const searchAction = {
    label: "Search",
    Glyph: MagnifyingGlass,
    onClick: openSearchPalette,
  };
  // The short worktree NAME (binding Figma top bar shows "main", not the full
  // scope path) — the last path segment of the active scope.
  const worktree =
    typeof scope === "string" && scope
      ? (scope.split(/[\\/]/).pop() ?? scope)
      : "Vault";
  const title = surface === "browse" ? worktree : (SURFACE_TITLE[surface] ?? "Browse");
  const actions =
    surface === "browse"
      ? [
          searchAction,
          {
            label: "Advanced filters",
            Glyph: Funnel,
            onClick: () => toggleFilterSidebar(),
            active: filterOpen,
          },
        ]
      : surface === "timeline"
        ? [
            {
              label: "Jump to now",
              text: "Now",
              onClick: () => setTimelinePlayhead("live"),
            },
          ]
        : [];

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Skip link — the first tab stop, jumps focus past the mobile top bar into
          the pane content (keyboard-navigation; parity with the desktop shell).
          Visually hidden until focused. */}
      <a
        href="#stage"
        className="sr-only focus:not-sr-only focus:absolute focus:left-fg-2 focus:top-fg-2 focus:z-50 focus:rounded-fg-sm focus:bg-paper focus:px-fg-2 focus:py-fg-1 focus:text-ink focus:outline focus:outline-2 focus:outline-focus"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>
      <MobileTopBar title={title} actions={actions} />
      <main
        ref={mainRef}
        id="stage"
        tabIndex={-1}
        data-focus-region="stage"
        className="relative min-h-0 flex-1 overflow-y-auto outline-none"
      >
        {surface === "browse" && <LeftRail />}
        {surface === "status" && <StatusTab />}
        {surface === "graph" && <GraphUnavailable />}
        {surface === "timeline" && <CompactTimeline scope={scope} />}
      </main>
      <BottomTabBar active={surface} onSelect={onSelect} />
      {/* Sliding document reader (D5): full-screen over the pane + tab bar when a
          document is open; the back control pops it. */}
      <CompactDocReader />
    </div>
  );
}
