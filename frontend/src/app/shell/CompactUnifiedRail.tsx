// The compact unified rail (mobile-unified-rail ADR). The Home pane of the compact
// shell: the former Browse (left rail) and Status (right rail) surfaces, merged into
// ONE vertical scroll so the critical glanceable state — plan progress, open PRs /
// issues, the working-tree Changes fold, recent commits — is never hidden behind a
// tab. Status leads (the state a user pulls the phone out to check), then the Browse
// tree, each under a sticky collapsible section header.
//
// The single scroll is the shell `<main>` (it owns `overflow-y-auto`); this rail is a
// natural-height stack, so `StatusTab` (already a natural-height section stack) and
// the compact `BrowserRegion` (natural-height on compact, see its viewport branch)
// flow into that one scroll. The two top-level folds reuse the canonical `FoldSection`
// primitive (design-system-is-centralized) with a sticky header treatment.
//
// Layer law (dashboard-layer-ownership): dumb chrome. It composes the existing
// surfaces and consumes view-local fold state; it fetches nothing, mints no node
// identity, reads no `tiers`. The canonical corpus filter stays authored in
// `app/left/` (filtering-has-one-canonical-surface, enforced by the
// filterConsolidation guard) — its mount lives in `CompactFilterSheet`; this rail
// renders that at TOP LEVEL, OUTSIDE the collapsible Browse body, so the top bar's
// filter button works regardless of the Browse fold state.
//
// The framework status cluster is the rail's pinned FOOTER (activity-rail-realignment
// ADR D6, compact parity): the SAME `FrameworkStatusCluster` the desktop rail pins,
// mounted here as a shrink-0 sibling BELOW the scrolling content region so it stays
// fixed at the rail's bottom edge while the Status/Browse stack scrolls — mirroring
// the desktop pin idiom (scroll on the content, cluster outside it). The four control
// panels the chips toggle mount once in `AppShell`'s compact branch (`ControlPanels`),
// so they open compact-safe from every chip.

import {
  toggleCompactRailBrowse,
  toggleCompactRailStatus,
  useCompactRailBrowseOpen,
  useCompactRailStatusOpen,
} from "../../stores/view/compactRailSections";
import { openContextMenu } from "../../stores/view/contextMenu";
import { FoldSection, SectionLabel } from "../kit";
import { BrowserRegion } from "../left/BrowserRegion";
import { CompactFilterSheet } from "../left/CompactFilterSheet";
import {
  backgroundContextMenuHandler,
  isRailBackgroundTarget,
} from "../menus/backgroundContextMenu";
import { FrameworkStatusCluster } from "../right/FrameworkStatusCluster";
import { StatusTab } from "../right/StatusTab";

// The two top-level section headers pin to the top of the Home-pane scroll as it
// moves (an accordion-sticky: Status stays until Browse pushes it up, then Browse
// takes over). Full-bleed with an opaque paper wash so scrolled content never shows
// through the pinned header; the roomier top-level padding matches the status
// sections. Keeps the FoldSection hover/focus idiom.
const STICKY_HEADER_CLASS =
  "sticky top-0 z-10 flex w-full items-center gap-fg-1 bg-paper px-fg-3 py-fg-2 text-left text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";

export function CompactUnifiedRail() {
  const statusOpen = useCompactRailStatusOpen();
  const browseOpen = useCompactRailBrowseOpen();

  return (
    <nav
      aria-label="Home"
      data-compact-unified-rail
      onContextMenu={backgroundContextMenuHandler(
        "left-rail",
        openContextMenu,
        isRailBackgroundTarget,
      )}
      className="flex h-full min-h-0 flex-col text-ink-muted"
    >
      {/* The scrolling content region — the Status then Browse folds. Owns the
          scroll (its sticky section headers pin to THIS box), so the footer cluster
          below stays outside the scroll (desktop pin idiom). */}
      <div className="min-h-0 flex-1 overflow-y-auto" data-compact-rail-scroll>
        <FoldSection
          open={statusOpen}
          onToggle={toggleCompactRailStatus}
          label={<SectionLabel>Status</SectionLabel>}
          headerClassName={STICKY_HEADER_CLASS}
          bodyClassName="px-fg-3 pb-fg-4"
          bodyId="compact-rail-status"
        >
          <StatusTab />
        </FoldSection>

        <FoldSection
          open={browseOpen}
          onToggle={toggleCompactRailBrowse}
          label={<SectionLabel>Browse</SectionLabel>}
          headerClassName={STICKY_HEADER_CLASS}
          bodyClassName="px-fg-3 pb-fg-4"
          bodyId="compact-rail-browse"
        >
          <BrowserRegion />
        </FoldSection>
      </div>

      {/* The framework status cluster — pinned rail FOOTER, a shrink-0 sibling of the
          scroll region above (activity-rail-realignment ADR D6). Same component the
          desktop rail pins; the compact scroll never contains it. */}
      <FrameworkStatusCluster />

      {/* Canonical corpus filter (compact bottom sheet), authored under `app/left/`
          and mounted here at top level — outside the Browse fold — opened by the Home
          top bar's filter button through the shared filter-sidebar store. */}
      <CompactFilterSheet />
    </nav>
  );
}
