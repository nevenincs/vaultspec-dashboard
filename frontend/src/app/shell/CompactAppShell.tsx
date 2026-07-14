// The compact (phone/tablet) shell (mobile-responsive-layout ADR D2). When the
// viewport is compact, the AppShell renders THIS instead of the desktop
// three-column grid: a single pane at a time — chosen by the bottom tab bar —
// under a mobile top bar. It is the compact branch of the ONE shell projection
// (responsive-layout-is-one-viewport-aware-projection), not a parallel app.
//
// Surfaces: Home (the unified rail — the Status section then the Browse tree in ONE
// scroll, mobile-unified-rail ADR) and Timeline (scrubber minimode, D2t). The graph
// is desktop-only (D4) — it has NO compact tab or surface (an "unavailable" tab is
// worse than no tab). Search is the momentary tab that opens the full-screen
// command palette (D3). Documents open via the sliding navigator (D5).
//
// Layer law (dashboard-layer-ownership / view-rewrite-preserves-the-contract):
// composes the existing surfaces and the mobile primitives, consuming the
// preserved stores hooks unchanged. The heavy WebGL graph canvas is NOT mounted
// here (ADR D4 — not mounted on a cold compact load), so the dock workspace is
// absent from this branch.

import { legacyActionPresentation } from "../../platform/actions/action";
import { useEffect, useRef, useState } from "react";

import { useActiveScope } from "../../stores/server/queries";
import { setCompactSurface, useCompactSurface } from "../../stores/view/compactSurface";
import {
  openSearchPalette,
  SEARCH_PALETTE_ACTION_ID,
} from "../../stores/view/commandPalette";
import { LEFT_RAIL_TOGGLE_FACETS_ACTION_ID } from "../../stores/view/leftRailKeybindings";
import {
  toggleFilterSidebar,
  useFilterSidebarOpen,
} from "../../stores/view/filterSidebar";
import { Funnel, MagnifyingGlass } from "../kit/glyphs";
import { BottomTabBar, type CompactSurface } from "./BottomTabBar";
import { CompactDocReader } from "./CompactDocReader";
import { CompactTimeline } from "./CompactTimeline";
import { CompactUnifiedRail } from "./CompactUnifiedRail";
import { MobileTopBar } from "./MobileTopBar";
import { WorkspaceSwitcherSheet } from "./WorkspaceSwitcherSheet";

const SURFACE_TITLE: Record<string, string> = {
  timeline: "Timeline",
};

export function CompactAppShell() {
  const surface = useCompactSurface();
  const scope = useActiveScope();
  const filterOpen = useFilterSidebarOpen();
  const mainRef = useRef<HTMLElement>(null);
  // The workspace switcher sheet (mobile-enrichment D1) is opened only from the Home
  // top-bar title trigger, so its open state is local chrome (no cross-surface need).
  const [switcherOpen, setSwitcherOpen] = useState(false);

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

  // The Home top bar is the worktree name + search + advanced-filter (the unified
  // rail carries the former Browse chrome: the worktree header + filter live in the
  // top bar). The Timeline surface shows its title only — search is reached via the
  // bottom Search tab, and the timeline frame carries no top-bar action.
  const searchAction = {
    id: SEARCH_PALETTE_ACTION_ID,
    label: legacyActionPresentation("Search"),
    Glyph: MagnifyingGlass,
    onClick: openSearchPalette,
  };
  // The short worktree NAME (binding Figma top bar shows "main", not the full
  // scope path) — the last path segment of the active scope.
  const worktree =
    typeof scope === "string" && scope
      ? (scope.split(/[\\/]/).pop() ?? scope)
      : "Vault";
  const title = surface === "home" ? worktree : (SURFACE_TITLE[surface] ?? "Home");
  const actions =
    surface === "home"
      ? [
          searchAction,
          {
            id: LEFT_RAIL_TOGGLE_FACETS_ACTION_ID,
            label: legacyActionPresentation("Advanced filters"),
            Glyph: Funnel,
            onClick: () => toggleFilterSidebar(),
            active: filterOpen,
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
      <MobileTopBar
        title={title}
        actions={actions}
        // On Home the title IS the worktree name — make it the workspace-switcher
        // trigger (mobile-enrichment D1). The Timeline surface keeps a plain heading.
        onTitleActivate={surface === "home" ? () => setSwitcherOpen(true) : undefined}
        titleActivateLabel={
          surface === "home" ? `${worktree} — switch workspace` : undefined
        }
      />
      <main
        ref={mainRef}
        id="stage"
        tabIndex={-1}
        data-focus-region="stage"
        className="relative min-h-0 flex-1 overflow-y-auto outline-none"
      >
        {surface === "home" && <CompactUnifiedRail />}
        {surface === "timeline" && <CompactTimeline scope={scope} />}
      </main>
      <BottomTabBar active={surface} onSelect={onSelect} />
      {/* Sliding document reader (D5): full-screen over the pane + tab bar when a
          document is open; the back control pops it. */}
      <CompactDocReader />
      {/* Workspace switcher (mobile-enrichment D1): opened from the Home title trigger. */}
      <WorkspaceSwitcherSheet
        open={switcherOpen}
        onDismiss={() => setSwitcherOpen(false)}
      />
    </div>
  );
}
