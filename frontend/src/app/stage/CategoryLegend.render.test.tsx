// @vitest-environment happy-dom
//
// Category legend = canonical filter author (unified-filter-plane D2). Each
// DOC-TYPE item writes the ONE `dashboardState.filters.doc_types` facet through the
// shared filter intent (the SAME facet the left-rail KIND section authors), so a
// category narrowed on the graph cross-wires to the rail tree, the graph, and the
// timeline. The legend is ALWAYS a horizontal row — `[chevron] | [sep] | [items]`;
// an arrow-only chevron toggles EXPANDED (icon + label) vs COMPACT (icon only), and
// the category icons are ALWAYS visible. A selected category renders as an accent
// PILL, and a state-aware Reset clears ONLY the `doc_types` facet through the
// canonical scoped-clear seam (`clearFacet`) — never the retired canvas-local mask,
// never the other flyout facets. `feature` is not a document category, so it is not
// in the legend.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  docTypes: [] as string[],
  toggleFacet: vi.fn(),
  clearFacet: vi.fn(),
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
    clearFacet: h.clearFacet,
    clearFilters: vi.fn(),
  }),
}));

import { CategoryLegend } from "./CategoryLegend";

function maybeItem(token: string): HTMLElement | null {
  const el = document.querySelector(`[data-category-legend-item="${token}"]`);
  return el instanceof HTMLElement ? el : null;
}
function item(token: string): HTMLElement {
  const el = maybeItem(token);
  if (!el) throw new Error(`no legend item ${token}`);
  return el;
}
function toggle(): HTMLElement {
  const el = document.querySelector("[data-category-legend-toggle]");
  if (!(el instanceof HTMLElement)) throw new Error("no legend toggle");
  return el;
}
function maybeReset(): HTMLElement | null {
  const el = document.querySelector("[data-category-legend-reset]");
  return el instanceof HTMLElement ? el : null;
}
/** Does a category item carry a (mark icon) — always present in both modes? */
function hasMark(token: string): boolean {
  return !!item(token).querySelector("[data-category-legend-mark]");
}

afterEach(() => {
  cleanup();
  h.docTypes = [];
  h.toggleFacet.mockClear();
  h.clearFacet.mockClear();
});

describe("CategoryLegend (canonical doc_types filter, unified-filter-plane D2)", () => {
  it("renders one horizontal row of category items, expanded (icon + label) by default", () => {
    render(createElement(CategoryLegend));
    expect(
      document.querySelector("[data-category-legend-mode='expanded']"),
    ).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "category filters" })).toBeTruthy();
    // The items (icons) are shown straight away — no dropdown/trigger to open.
    expect(item("adr")).toBeTruthy();
    expect(hasMark("adr")).toBe(true);
    // Expanded → the label is shown alongside the icon.
    expect(item("adr").textContent?.length ?? 0).toBeGreaterThan(0);
    // The toggle is an arrow only — no "Categories" text.
    expect(toggle().textContent).toBe("");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("toggles to COMPACT (icons only, labels dropped) and back — icons always visible", () => {
    render(createElement(CategoryLegend));
    fireEvent.click(toggle());
    expect(
      document.querySelector("[data-category-legend-mode='compact']"),
    ).toBeTruthy();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    // Compact → the icon stays, the label is gone.
    expect(hasMark("adr")).toBe(true);
    expect(item("adr").textContent).toBe("");
    // Toggle back → labels return.
    fireEvent.click(toggle());
    expect(
      document.querySelector("[data-category-legend-mode='expanded']"),
    ).toBeTruthy();
    expect((item("adr").textContent?.length ?? 0) > 0).toBe(true);
  });

  it("has no `feature` item (features are not a document category)", () => {
    render(createElement(CategoryLegend));
    expect(maybeItem("feature")).toBeNull();
  });

  it("writes the canonical doc_types facet when a doc-type item is clicked", () => {
    render(createElement(CategoryLegend));
    fireEvent.click(item("adr"));
    expect(h.toggleFacet).toHaveBeenCalledWith("doc_types", "adr");
    fireEvent.click(item("plan"));
    expect(h.toggleFacet).toHaveBeenCalledWith("doc_types", "plan");
  });

  it("renders a selected category as an accent pill and dims the excluded ones", () => {
    h.docTypes = ["adr"];
    render(createElement(CategoryLegend));
    // Selected → accent pill (clear ON state), pressed for assistive tech.
    expect(item("adr").className).toContain("rounded-fg-pill");
    expect(item("adr").className).toContain("bg-accent-subtle");
    expect(item("adr").getAttribute("aria-pressed")).toBe("true");
    // Unselected → resting appearance, dimmed, not a pill.
    expect(item("plan").className).toContain("opacity-40");
    expect(item("plan").className).not.toContain("rounded-fg-pill");
    expect(item("plan").getAttribute("aria-pressed")).toBe("false");
  });

  it("shows every category at full opacity when no doc_types filter is active", () => {
    render(createElement(CategoryLegend));
    expect(item("adr").className).toContain("opacity-100");
    expect(item("research").className).toContain("opacity-100");
  });

  it("shows Reset only when a filter is active, and it clears only doc_types", () => {
    render(createElement(CategoryLegend));
    // No filter active → no Reset.
    expect(maybeReset()).toBeNull();
    cleanup();
    h.docTypes = ["adr"];
    render(createElement(CategoryLegend));
    const resetBtn = maybeReset();
    expect(resetBtn).toBeTruthy();
    fireEvent.click(resetBtn!);
    expect(h.clearFacet).toHaveBeenCalledWith("doc_types");
    // The scoped clear is used — never the whole-record clobber.
    expect(h.toggleFacet).not.toHaveBeenCalled();
  });
});
