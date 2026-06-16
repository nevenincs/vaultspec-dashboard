// The activity-rail tab bar (figma-frontend-rewrite W02.P05.S08; binding Figma
// ActivityRail board node 244:753, TabBar nodes 139:2 / 139:12 / 139:22). A row of
// label tabs switching the rail body between its panes, matching the binding board
// EXACTLY: the active tab is rendered in medium weight body ink with a 2px × 24px
// accent underline bar beneath it; inactive tabs are regular weight in faint ink
// with a transparent bar (so every tab keeps the same height and the underline
// never reflows the row). The TabBar sits on `pt-fg-3 px-fg-1-5` with `gap-fg-1-5`
// between tabs, each tab `px-fg-2 py-fg-1` with the bar `gap-fg-1-5` below the
// label — the board's metrics in the role-named token vocabulary. No raw hex, no
// loose font-size: the label rides the `body` type role and the colors resolve to
// the bound ink / accent tokens.
//
// IA NOTE — the binding board shows THREE label tabs (Status · Changes · Search).
// The shipped host (`ActivityRail` in AppShell) still renders a FOUR-id IA
// (status · inspect · search · changes): the Inspect pane is a shipped capability
// the board does not depict. The tab IDENTITY contract is shared with the host
// across the scope boundary (AppShell owns the tab->pane mapping and the
// `rail-panel-*` ids), so this leaf tab bar keeps the four-id union stable; the
// board's three-tab IA collapse is a HOST rewire (the Inspect-pane retirement /
// fold), not this presentation rewrite. S08 brings the tab bar's VISUAL treatment
// to the board (the underline idiom, replacing the prior raised-pill segmented
// control); the id contract is untouched.
//
// Layer ownership (dashboard-layer-ownership): this is pure chrome — it holds no
// wire state, fetches nothing, and reads no `tiers` block; it only flips the
// active-tab id its parent owns.

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useRef } from "react";

export type RailTabId = "status" | "inspect" | "search" | "changes";

// Status · Inspect · Search · Changes, left to right. The board depicts Status,
// Changes, and Search as label-only tabs (no leading mark); Inspect is the shipped
// pane the board does not show, carried in the same label-only idiom for a uniform
// tab row until the host folds the IA to the board's three.
export const RAIL_TABS: { id: RailTabId; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "inspect", label: "Inspect" },
  { id: "search", label: "Search" },
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

  // Roving arrow-key movement across the tab row: ArrowLeft/Right (and Up/Down)
  // move and activate, so the active pane is reachable and switchable from the
  // keyboard alone (the tablist a11y pattern).
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
      className="flex shrink-0 items-start gap-fg-1-5"
    >
      {RAIL_TABS.map(({ id, label }, index) => {
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
            // move between the tabs.
            tabIndex={isActive ? 0 : -1}
            data-rail-tab={id}
            data-rail-tab-active={isActive ? "" : undefined}
            onClick={() => onChange(id)}
            onKeyDown={onKeyDown(index)}
            className="flex shrink-0 flex-col items-center gap-fg-1-5 rounded-fg-xs px-fg-2 py-fg-1 transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <span
              className={`text-body ${
                isActive
                  ? "font-medium text-ink"
                  : "font-normal text-ink-faint hover:text-ink-muted"
              }`}
            >
              {label}
            </span>
            {/* 2px × 24px underline bar — accent when active, transparent
                otherwise so the row height never reflows. */}
            <span
              aria-hidden
              data-rail-tab-bar
              className={`h-0.5 w-6 rounded-fg-xs ${
                isActive ? "bg-accent" : "bg-transparent"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
