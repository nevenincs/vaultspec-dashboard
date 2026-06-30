// The left scope rail composition (binding `LeftRail` 238:600). The rail is CHROME
// that hosts independently-specified controls and owns only their composition. Top
// to bottom this stack hosts, separated by hairline dividers exactly as the binding
// frame:
//
//   1. WorktreePicker  — the project/worktree header: the current name as a plain
//                        title that opens the chooser, plus the single rail-collapse
//                        toggle.
//   2. RailFilterField — the ONE canonical filter: a FEATURE filter (type → narrow)
//                        that pops up the fine-tuned facet flyout on focus.
//   3. BrowserRegion   — the Vault | Files tabs and the active tab's tree.
//
// THE SINGLE NAVIGATION LAW (dashboard-left-rail ADR / engine-read-and-infer):
// every interaction resolves to one of exactly three intents emitted through the
// stores layer — select a scope, select a node, or adjust a view-local affordance
// (collapse, tab, filter, expand). The rail issues NO mutation intent: no write path
// to git/disk/vault, no component fetches the engine, mints a node identity, or
// reads the raw `tiers` block. This module composes; the hosted controls own their
// behaviour.

import { openContextMenu } from "../../stores/view/contextMenu";
import { useActiveScope } from "../../stores/server/queries";
import {
  closeFilterSidebar,
  useFilterSidebarOpen,
} from "../../stores/view/filterSidebar";
import { useViewportClass } from "../../stores/view/viewportClass";
import {
  backgroundContextMenuHandler,
  isRailBackgroundTarget,
} from "../menus/backgroundContextMenu";
import { Divider } from "../kit";
import { FilterSidebar } from "../stage/FilterSidebar";
import { BrowserRegion } from "./BrowserRegion";
import { RailFilterField } from "./RailFilterField";
import { WorktreePicker } from "./WorktreePicker";

export function LeftRail() {
  const compact = useViewportClass() === "compact";
  const scope = useActiveScope();
  const filterOpen = useFilterSidebarOpen();

  // Compact (mobile-responsive-layout ADR D2): the worktree header, the
  // rail-collapse/panel chrome, and the feature-search row fold into the mobile top
  // bar, so the compact rail is JUST the Vault/Files browser tree. The canonical
  // filter is still authored here (filtering-has-one-canonical-surface) — the
  // FilterSidebar stays mounted (rendering as a bottom sheet on compact), opened by
  // the top bar's filter button via the shared filter-sidebar store.
  if (compact) {
    return (
      <nav
        aria-label="scope rail"
        data-left-rail
        onContextMenu={backgroundContextMenuHandler(
          "left-rail",
          openContextMenu,
          isRailBackgroundTarget,
        )}
        className="flex min-h-0 flex-1 flex-col px-fg-3 pt-fg-2 text-ink-muted"
      >
        <div className="flex min-h-0 flex-1 flex-col" data-rail-slot="browser">
          <BrowserRegion />
        </div>
        <FilterSidebar
          open={filterOpen}
          onClose={closeFilterSidebar}
          scope={scope}
          hidden={{ nodes: 0, edges: 0 }}
        />
      </nav>
    );
  }

  return (
    // ONE labelled navigation landmark for the whole rail content. The flex column
    // gives the browser region the remaining height so it dominates the rail (the
    // header, filter, and tabs are compact). Binding spacing: px/pt 12, a 12px gap
    // between the stacked slots, hairline dividers bracketing the filter field.
    <nav
      aria-label="scope rail"
      data-left-rail
      onContextMenu={backgroundContextMenuHandler("left-rail", openContextMenu)}
      className="flex min-h-0 flex-1 flex-col gap-fg-3 px-fg-3 pt-fg-3 text-ink-muted"
    >
      <div className="shrink-0" data-rail-slot="worktree">
        <WorktreePicker />
      </div>

      <Divider />

      <div className="shrink-0" data-rail-slot="filter">
        <RailFilterField />
      </div>

      <Divider />

      {/* Vault/Files tabs + the active tab's tree. Fills the remaining height so the
          browser dominates the rail. */}
      <div className="flex min-h-0 flex-1 flex-col gap-fg-3" data-rail-slot="browser">
        <BrowserRegion />
      </div>
    </nav>
  );
}
