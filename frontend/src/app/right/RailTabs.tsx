// The activity-rail tab bar (binding Figma `RightRail` / `ActivityTabs`, node
// 17:563; refined by the status-overview ADR node 112:2): a compact segmented
// control switching the rail body between its four panes — Status (the primary
// overview: location anchor + plan-derived open work + recent commits), Inspect
// (the selected-node lens), Changes (git working-tree + diff), Search (rag
// query). The status-overview ADR refines the prior Inspect/Work/Changes/Search
// set: the Work pillar's in-flight plans fold into Status (the headline surface),
// so Status is the primary tab and the four-tab law is honored (no fifth tab is
// minted; the changed-files/diff capability stays as Changes). The
// segmented-control idiom and its a11y mirror the left rail's
// `BrowserModeToggle`: one ARIA tablist, the active tab a raised paper pill with
// a soft card shadow, roving arrow-key movement that auto-scales to the tab
// count, and a roving tabindex so only the active tab sits in the Tab order.
//
// Layer ownership (dashboard-layer-ownership): this is pure chrome — it holds no
// wire state, fetches nothing, and reads no `tiers` block; it only flips the
// active-tab id its parent owns.
//
// Icons come from the two sanctioned families (icons-come-from-the-two-sanctioned
// -families): the Inspect and Search tabs carry their structural Lucide chrome
// marks (Eye / Search), matching the binding design; Work and Changes are
// label-only, exactly as the design shows.

import { Activity, Eye, Search, type LucideIcon } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useRef } from "react";

// 12px structural chrome marks, one density step below the 14px gate so the tab
// glyphs stay attenuated against the label (design-language ADR layer 4).
const MARK_PX = 12;

export type RailTabId = "status" | "inspect" | "search" | "changes";

// Status · Inspect · Search · Changes, left to right — the status-overview ADR
// makes Status the primary (leading) tab; Inspect and Search are unchanged, and
// Changes keeps the working-tree/diff capability. Status and Inspect/Search carry
// a leading Lucide structural mark; Changes is label-only, matching the design.
export const RAIL_TABS: { id: RailTabId; label: string; mark?: LucideIcon }[] = [
  { id: "status", label: "Status", mark: Activity },
  { id: "inspect", label: "Inspect", mark: Eye },
  { id: "search", label: "Search", mark: Search },
  { id: "changes", label: "Changes" },
];

export interface RailTabsProps {
  active: RailTabId;
  onChange: (tab: RailTabId) => void;
}

export function RailTabs({ active, onChange }: RailTabsProps) {
  const tabEls = useRef(new Map<RailTabId, HTMLButtonElement>());
  const registerTab = useCallback(
    (id: RailTabId) => (el: HTMLButtonElement | null) => {
      if (el) tabEls.current.set(id, el);
      else tabEls.current.delete(id);
    },
    [],
  );

  // Roving arrow-key movement across the segmented control: ArrowLeft/Right (and
  // Up/Down) move and activate, so the active pane is reachable and switchable
  // from the keyboard alone (the segmented-control a11y pattern).
  const onKeyDown = (index: number) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (
      e.key === "ArrowRight" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowUp"
    ) {
      e.preventDefault();
      const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
      const next = (index + (forward ? 1 : RAIL_TABS.length - 1)) % RAIL_TABS.length;
      const target = RAIL_TABS[next]!;
      onChange(target.id);
      tabEls.current.get(target.id)?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label="activity rail tabs"
      aria-orientation="horizontal"
      data-rail-tabs
      className="flex shrink-0 gap-vs-0-5 rounded-vs-md border border-rule bg-paper-sunken p-vs-0-5"
    >
      {RAIL_TABS.map(({ id, label, mark: Mark }, index) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            ref={registerTab(id)}
            type="button"
            role="tab"
            id={`rail-tab-${id}`}
            aria-selected={isActive}
            aria-controls={`rail-panel-${id}`}
            // Roving tabindex: only the active tab is in the Tab order; arrows
            // move between the four.
            tabIndex={isActive ? 0 : -1}
            data-rail-tab={id}
            data-rail-tab-active={isActive ? "" : undefined}
            onClick={() => onChange(id)}
            onKeyDown={onKeyDown(index)}
            className={`flex min-w-0 flex-1 items-center justify-center gap-vs-1 rounded-vs-sm px-vs-1-5 py-vs-0-5 text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
              isActive
                ? "bg-paper-raised font-medium text-ink shadow-card"
                : "text-ink-faint hover:text-ink-muted"
            }`}
          >
            {Mark && (
              <span className="shrink-0" aria-hidden>
                <Mark size={MARK_PX} />
              </span>
            )}
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
