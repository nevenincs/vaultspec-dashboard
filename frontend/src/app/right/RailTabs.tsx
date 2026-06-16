// The activity-rail tab bar (figma-parity-reconciliation W02.P05.S28; binding
// Figma ActivityRail Kit primitive node 244:753, composed in the `RightRail`
// frame 17:563): a compact segmented control switching the rail body between its
// four panes. Rebuilt onto the NEW Figma role-named token foundation
// (figma-parity-reconciliation ADR): the segmented track is a sunken paper rail
// on the canonical radius (`rounded-fg-md`), the active tab a raised paper pill
// at `rounded-fg-xs` with the three-level raised elevation (`shadow-fg-raised`),
// and the label role drives type. No raw hex, no legacy six-level shadow, no
// retired radius scale.
//
// The tab IDENTITY contract is shared with the rail host (`ActivityRail` in
// AppShell, which owns the persistent NowStrip liveness header above this bar and
// the tab->pane mapping). The binding-design IA rename (Inspect | Work | Search |
// Changes) is the activity-rail-ADR supersession, governed by W04.P10.S57 and the
// paired host rewire in W02.P04 (AppShell), NOT by this leaf tab bar: changing the
// id union here in isolation would break the host's typecheck across the scope
// boundary. S28 rebuilds the tab bar's visual treatment onto the foundation; the
// id contract stays stable until the host adopts the renamed IA.
//
// The segmented-control idiom and its a11y mirror the left rail's
// `BrowserModeToggle`: one ARIA tablist, the active tab a raised paper pill,
// roving arrow-key movement that auto-scales to the tab count, and a roving
// tabindex so only the active tab sits in the Tab order.
//
// Layer ownership (dashboard-layer-ownership): this is pure chrome — it holds no
// wire state, fetches nothing, and reads no `tiers` block; it only flips the
// active-tab id its parent owns.
//
// Icons come from the two sanctioned families (icons-come-from-the-two-sanctioned
// -families): each non-label-only tab carries its structural Lucide chrome mark,
// matching the binding design; the label-only tab shows no mark, as the design
// shows.

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
      className="flex shrink-0 gap-fg-0-5 rounded-fg-md border border-rule bg-paper-sunken p-fg-0-5"
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
            className={`flex min-w-0 flex-1 items-center justify-center gap-fg-1 rounded-fg-xs px-fg-1-5 py-fg-0-5 text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
              isActive
                ? "bg-paper-raised font-medium text-ink shadow-fg-raised"
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
