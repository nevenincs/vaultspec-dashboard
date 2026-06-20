import { describe, expect, it } from "vitest";

import { deriveFilterBarChromeView, filterBarHiddenCostLabel } from "./filterBarChrome";

describe("filter bar chrome view seam", () => {
  it("names the filter cost and hides the chip at zero", () => {
    expect(filterBarHiddenCostLabel({ nodes: 0, edges: 0 })).toBeNull();
    expect(filterBarHiddenCostLabel({ nodes: 142, edges: 0 })).toBe("142 nodes hidden");
    expect(filterBarHiddenCostLabel({ nodes: 3, edges: 7 })).toBe(
      "3 nodes · 7 edges hidden",
    );
  });

  it("projects filter toolbar chrome from summary and hidden counts", () => {
    expect(
      deriveFilterBarChromeView(
        { activeFilterCount: 2, dateRangeLabel: "2026-06-01 → 2026-06-18" },
        { nodes: 3, edges: 7 },
        { sidebarAvailable: true, sidebarOpen: true },
      ),
    ).toEqual({
      containerClassName:
        "pointer-events-auto absolute inset-x-0 top-0 z-10 flex flex-wrap content-center items-center gap-x-fg-2 gap-y-fg-1 border-b border-rule bg-paper-raised px-fg-2 py-fg-1-5 text-label",
      sidebarGroupClassName: "flex items-center gap-fg-1",
      sidebarToggleLabel: "close filter panel",
      sidebarToggleTitle: "toggle filter sidebar",
      sidebarToggleActive: true,
      showActiveFilterBadge: true,
      activeFilterCount: 2,
      searchPlaceholder: "Search documents…",
      searchAriaLabel: "text match filter",
      nodeCountClassName: "tabular-nums text-ink-muted",
      dateRangeChipVisible: true,
      dateRangeChipLabel: "2026-06-01 → 2026-06-18",
      dateRangeChipTimelineLabel: "(timeline)",
      dateRangeChipClassName:
        "rounded-fg-pill border border-rule bg-paper px-fg-1-5 py-fg-0-5 tabular-nums text-ink-muted",
      hiddenCostLabel: "3 nodes · 7 edges hidden",
      hiddenCostChipClassName:
        "rounded-fg-pill border border-state-stale bg-paper-raised px-fg-1-5 py-fg-0-5 tabular-nums text-state-stale",
    });
  });

  it("projects closed and empty toolbar states without badges or chips", () => {
    expect(
      deriveFilterBarChromeView(
        { activeFilterCount: 0, dateRangeLabel: null },
        { nodes: 0, edges: 0 },
        { sidebarAvailable: false },
      ),
    ).toMatchObject({
      sidebarToggleLabel: "open filter panel",
      sidebarToggleActive: false,
      showActiveFilterBadge: false,
      dateRangeChipVisible: false,
      hiddenCostLabel: null,
    });
  });
});
