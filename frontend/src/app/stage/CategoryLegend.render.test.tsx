// @vitest-environment happy-dom
//
// Category legend = canonical filter author (unified-filter-plane D2). Each
// DOC-TYPE item writes the ONE `dashboardState.filters.doc_types` facet through the
// shared filter intent (the SAME facet the left-rail KIND section authors), so a
// category narrowed on the graph cross-wires to the rail tree, the graph, and the
// timeline. The `feature` item is the aggregation's colour KEY, not a vault
// doc-type, so it is a static swatch (no toggle). The retired canvas-local
// `hiddenCategories` mask no longer exists.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  docTypes: [] as string[],
  toggleFacet: vi.fn(),
}));

vi.mock("../../stores/server/queries", () => ({
  useActiveScope: () => "wt-1",
  useVaultRailFacets: () => ({
    docTypes: h.docTypes,
    statuses: [],
    featureTags: [],
    featureQuery: null,
    dateRange: {},
  }),
}));
vi.mock("../../stores/server/dashboardFilterSidebarIntent", () => ({
  useDashboardFilterSidebarIntent: () => ({
    toggleFacet: h.toggleFacet,
    clearFilters: vi.fn(),
  }),
}));

import { CategoryLegend } from "./CategoryLegend";

function item(token: string): HTMLElement {
  const el = document.querySelector(`[data-category-legend-item="${token}"]`);
  if (!(el instanceof HTMLElement)) throw new Error(`no legend item ${token}`);
  return el;
}

afterEach(() => {
  cleanup();
  h.docTypes = [];
  h.toggleFacet.mockClear();
});

describe("CategoryLegend (canonical doc_types filter, unified-filter-plane D2)", () => {
  it("writes the canonical doc_types facet when a doc-type item is clicked", () => {
    render(createElement(CategoryLegend));
    fireEvent.click(item("adr"));
    expect(h.toggleFacet).toHaveBeenCalledWith("doc_types", "adr");
    fireEvent.click(item("plan"));
    expect(h.toggleFacet).toHaveBeenCalledWith("doc_types", "plan");
  });

  it("renders the feature item as a static colour key, not a filter toggle", () => {
    render(createElement(CategoryLegend));
    // The feature aggregation has no `doc_types` value, so its legend entry is a
    // non-interactive swatch (a <span>), never a <button>.
    expect(item("feature").tagName).toBe("SPAN");
    expect(item("adr").tagName).toBe("BUTTON");
  });

  it("dims the categories the active doc_types filter excludes", () => {
    h.docTypes = ["adr"];
    render(createElement(CategoryLegend));
    // With `adr` selected, only the ADR item stays full-opacity; the rest dim.
    expect(item("adr").className).toContain("opacity-100");
    expect(item("plan").className).toContain("opacity-40");
    // The selected facet is reflected as pressed for assistive tech.
    expect(item("adr").getAttribute("aria-pressed")).toBe("true");
    expect(item("plan").getAttribute("aria-pressed")).toBe("false");
  });

  it("shows every category at full opacity when no doc_types filter is active", () => {
    render(createElement(CategoryLegend));
    expect(item("adr").className).toContain("opacity-100");
    expect(item("research").className).toContain("opacity-100");
    expect(screen.getByRole("group", { name: "category filters" })).toBeTruthy();
  });
});
