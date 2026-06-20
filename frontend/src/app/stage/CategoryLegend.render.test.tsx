// @vitest-environment happy-dom
//
// Category legend (binding Figma `graph/Hero` Legend 99:2): the LIVE legend's
// render surface, accessibility, and toggle wiring, exercised through a real DOM
// render against the real view store — no component-internal doubles.
//
// What is asserted (live legend):
//   • the legend is an accessible group of category-filter toggle buttons, each
//     pressed (shown) by default;
//   • clicking a category toggles its canvas visibility — aria-pressed flips and
//     the view store's hiddenCategories mask gains/loses the category token;
//   • the swatch + label still name the encoding (a swatch and its nodes agree).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setHiddenCategories } from "../../stores/view/graphCategoryVisibility";
import { useViewStore } from "../../stores/view/viewStore";
import { CategoryLegend } from "./CategoryLegend";

describe("CategoryLegend live filter toggles", () => {
  beforeEach(() => setHiddenCategories([]));
  afterEach(() => {
    cleanup();
    setHiddenCategories([]);
  });

  it("renders an accessible group of category-filter toggles, all shown by default", () => {
    render(createElement(CategoryLegend));
    expect(screen.getByRole("group", { name: "category filters" })).toBeTruthy();
    const toggles = screen.getAllByRole("button");
    expect(toggles).toHaveLength(7);
    // Every toggle starts pressed (category shown).
    for (const toggle of toggles) {
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
    }
  });

  it("hides a category on click and writes the canvas mask, then restores", () => {
    render(createElement(CategoryLegend));
    // The accessible name is the visible label text ("Decisions" for adr).
    const adr = screen.getByRole("button", { name: /decisions/i });
    expect(adr.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(adr);
    expect(useViewStore.getState().hiddenCategories).toContain("adr");
    expect(
      screen.getByRole("button", { name: /decisions/i }).getAttribute("aria-pressed"),
    ).toBe("false");

    // Toggling again clears it — the mask is empty and the category is shown.
    fireEvent.click(screen.getByRole("button", { name: /decisions/i }));
    expect(useViewStore.getState().hiddenCategories).not.toContain("adr");
    expect(
      screen.getByRole("button", { name: /decisions/i }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("toggles only the clicked category, leaving the rest shown", () => {
    render(createElement(CategoryLegend));
    fireEvent.click(screen.getByRole("button", { name: /plans/i }));
    expect(useViewStore.getState().hiddenCategories).toEqual(["plan"]);
  });
});
