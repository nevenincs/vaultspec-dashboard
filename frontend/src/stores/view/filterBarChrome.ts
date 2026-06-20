import type { DashboardFilterSummaryView } from "../server/queries";

export interface FilterBarHiddenCounts {
  nodes: number;
  edges: number;
}

export interface FilterBarChromeOptions {
  sidebarAvailable: boolean;
  sidebarOpen?: boolean;
}

export interface FilterBarChromeView {
  containerClassName: string;
  sidebarGroupClassName: string;
  sidebarToggleLabel: string;
  sidebarToggleTitle: string;
  sidebarToggleActive: boolean;
  showActiveFilterBadge: boolean;
  activeFilterCount: number;
  searchPlaceholder: string;
  searchAriaLabel: string;
  nodeCountClassName: string;
  dateRangeChipVisible: boolean;
  dateRangeChipLabel: string | null;
  dateRangeChipTimelineLabel: string;
  dateRangeChipClassName: string;
  hiddenCostLabel: string | null;
  hiddenCostChipClassName: string;
}

export function filterBarHiddenCostLabel(hidden: FilterBarHiddenCounts): string | null {
  if (hidden.nodes === 0 && hidden.edges === 0) return null;
  const parts: string[] = [];
  if (hidden.nodes > 0) parts.push(`${hidden.nodes} nodes`);
  if (hidden.edges > 0) parts.push(`${hidden.edges} edges`);
  return `${parts.join(" · ")} hidden`;
}

export function deriveFilterBarChromeView(
  summary: DashboardFilterSummaryView,
  hidden: FilterBarHiddenCounts,
  options: FilterBarChromeOptions,
): FilterBarChromeView {
  return {
    containerClassName:
      "pointer-events-auto absolute inset-x-0 top-0 z-10 flex flex-wrap content-center items-center gap-x-fg-2 gap-y-fg-1 border-b border-rule bg-paper-raised px-fg-2 py-fg-1-5 text-label",
    sidebarGroupClassName: "flex items-center gap-fg-1",
    sidebarToggleLabel: options.sidebarOpen
      ? "close filter panel"
      : "open filter panel",
    sidebarToggleTitle: "toggle filter sidebar",
    sidebarToggleActive: options.sidebarOpen ?? false,
    showActiveFilterBadge: options.sidebarAvailable && summary.activeFilterCount > 0,
    activeFilterCount: summary.activeFilterCount,
    searchPlaceholder: "Search documents…",
    searchAriaLabel: "text match filter",
    nodeCountClassName: "tabular-nums text-ink-muted",
    dateRangeChipVisible: summary.dateRangeLabel !== null,
    dateRangeChipLabel: summary.dateRangeLabel,
    dateRangeChipTimelineLabel: "(timeline)",
    dateRangeChipClassName:
      "rounded-fg-pill border border-rule bg-paper px-fg-1-5 py-fg-0-5 tabular-nums text-ink-muted",
    hiddenCostLabel: filterBarHiddenCostLabel(hidden),
    hiddenCostChipClassName:
      "rounded-fg-pill border border-state-stale bg-paper-raised px-fg-1-5 py-fg-0-5 tabular-nums text-state-stale",
  };
}
