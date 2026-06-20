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
// IA NOTE — the binding ActivityRail board (244:753) shows EXACTLY THREE
// label-only tabs in this order: Status · Changes · Search. This is the
// figma-frontend-rewrite IA, which supersedes the status-overview ADR's prior
// four-id (Status · Inspect · Search · Changes) plus persistent liveness-pillar
// header (board 112:2). The Inspect pane and the pillar header are retired from
// the rail in the rewrite — node detail lives in the reader / DocHeader, and the
// context card in the Status pane carries worktree/branch identity. The host
// (`ActivityRail` in AppShell) maps these three ids to their panes.
//
// Layer ownership (dashboard-layer-ownership): this is pure chrome — it holds no
// wire state, fetches nothing, and reads no `tiers` block; it only flips the
// active-tab id its parent owns.

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { Tab } from "../kit";
import {
  RIGHT_RAIL_TABS,
  rightRailAdjacentTab,
  type RailTabId,
} from "../../stores/view/shellLayout";

export interface RailTabsProps {
  active: RailTabId;
  onChange: (tab: RailTabId) => void;
}

export function RailTabs({ active, onChange }: RailTabsProps) {
  // Roving arrow-key movement across the tab row: ArrowLeft/Right (and Up/Down)
  // move and activate, so the active pane is reachable and switchable from the
  // keyboard alone (the tablist a11y pattern). Focus follows the kit Tab's id.
  const onKeyDown = (index: number) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const current = RIGHT_RAIL_TABS[index]?.id;
    if (!current) return;
    if (
      e.key === "ArrowRight" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowUp"
    ) {
      e.preventDefault();
      const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
      const target = rightRailAdjacentTab(current, forward ? "next" : "previous");
      onChange(target);
      document.getElementById(`rail-tab-${target}`)?.focus();
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
      {RIGHT_RAIL_TABS.map(({ id, label }, index) => {
        const isActive = active === id;
        return (
          // The centralized kit Tab (accent-underline + ink-weight active cue);
          // the rail keeps the roving-tablist focus model around it.
          <Tab
            key={id}
            id={`rail-tab-${id}`}
            active={isActive}
            onSelect={() => onChange(id)}
            aria-controls={`rail-panel-${id}`}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={onKeyDown(index)}
            data-rail-tab={id}
            data-rail-tab-active={isActive ? "" : undefined}
          >
            {label}
          </Tab>
        );
      })}
    </div>
  );
}
