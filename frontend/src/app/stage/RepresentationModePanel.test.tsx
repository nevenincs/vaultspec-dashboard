// @vitest-environment happy-dom
//
// graph-representation W04.P13.S54: the representation-mode and lens selector
// controls (canvas-controls amendment). Asserts:
//   • the mode selector renders the three v1 modes as role="switch" controls in
//     order, with the active one checked, and a click emits mode intent into the
//     view store (the scene command is Stage's job, the single scene owner);
//   • the lens selector renders the two launch lenses, active one checked, and a
//     click emits lens intent into the view store (a wire re-query);
//   • both are dumb views: they read + write only the view store, never fetch.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useViewStore } from "../../stores/view/viewStore";
import { LENS_OPTIONS, LensSelector } from "./LensSelector";
import { MODE_OPTIONS, RepresentationModePanel } from "./RepresentationModePanel";

afterEach(cleanup);

beforeEach(() => {
  // Reset the relevant view-store fields to defaults before each test.
  useViewStore.setState({
    activeRepresentationMode: "connectivity",
    activeLens: "status",
  });
});

describe("RepresentationModePanel", () => {
  it("renders the three v1 modes as role=switch controls in order", () => {
    render(createElement(RepresentationModePanel));
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(MODE_OPTIONS.length);
    expect(switches.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Connectivity",
      "Lineage",
      "Semantic",
    ]);
  });

  it("marks the active mode checked and switches on click (view store intent)", () => {
    render(createElement(RepresentationModePanel));
    const connectivity = screen.getByRole("switch", { name: "Connectivity" });
    const lineage = screen.getByRole("switch", { name: "Lineage" });
    expect(connectivity.getAttribute("aria-checked")).toBe("true");
    expect(lineage.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(lineage);
    expect(useViewStore.getState().activeRepresentationMode).toBe("lineage");
  });
});

describe("LensSelector", () => {
  it("renders the two launch lenses as role=switch controls", () => {
    render(createElement(LensSelector));
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(LENS_OPTIONS.length);
    expect(switches.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Status lens",
      "Design lens",
    ]);
  });

  it("marks the active lens checked and re-queries on click (view store intent)", () => {
    render(createElement(LensSelector));
    const status = screen.getByRole("switch", { name: "Status lens" });
    const design = screen.getByRole("switch", { name: "Design lens" });
    expect(status.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(design);
    expect(useViewStore.getState().activeLens).toBe("design");
  });
});
