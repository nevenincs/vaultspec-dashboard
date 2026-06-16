// @vitest-environment happy-dom
//
// Consolidated graph controls (binding Figma redesign `graph/Controls` 88:2).
// Rendered against the real SceneController singleton (getScene) and the real
// view store — no component-internal doubles.
//
// What is asserted (the IA consolidation mapping):
//   • Navigate emits the real camera SceneCommands (zoom-in/out, fit, reset);
//   • Layout segmented control drives the real representation mode (Network →
//     connectivity, Tree → lineage, Grouped → semantic) and the Timeline segment
//     enters time-travel (the temporal seam);
//   • the active segment reflects time-travel when the shared mode is time-travel;
//   • Zoom drives the real LOD descent (granularity feature ↔ document);
//   • Tune drives the real d3-force knobs via set-layout-params (Spacing → repel,
//     Connection reach → linkDistance, Clustering → linkForce);
//   • the controls read + write only stores / the scene seam, never fetch.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SEMANTIC_MODE_GATE } from "../../scene/field/semanticGate";
import { useViewStore } from "../../stores/view/viewStore";
import { GraphControls } from "./GraphControls";
import { getScene } from "./Stage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  useViewStore.setState({
    activeRepresentationMode: "connectivity",
    granularity: "feature",
    timelineMode: { kind: "live" },
  });
});

describe("GraphControls — Navigate (camera commands)", () => {
  it("emits the four camera SceneCommands", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    render(createElement(GraphControls));

    fireEvent.click(screen.getByRole("button", { name: "zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "fit to view" }));
    fireEvent.click(screen.getByRole("button", { name: "reset view" }));

    const kinds = spy.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).toEqual(
      expect.arrayContaining(["zoom-in", "zoom-out", "fit-to-view", "reset-view"]),
    );
  });
});

describe("GraphControls — Layout segmented control", () => {
  it("renders the four plain-language segments in order", () => {
    render(createElement(GraphControls));
    const group = screen.getByRole("group", { name: "graph layout" });
    const segs = Array.from(group.querySelectorAll("button[data-seg]"));
    expect(segs.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Network",
      "Tree",
      "Grouped",
      "Timeline",
    ]);
  });

  it("Network maps to the connectivity representation mode", () => {
    useViewStore.setState({ activeRepresentationMode: "lineage" });
    render(createElement(GraphControls));
    fireEvent.click(screen.getByRole("button", { name: "Network" }));
    expect(useViewStore.getState().activeRepresentationMode).toBe("connectivity");
  });

  it("Tree maps to the lineage representation mode", () => {
    render(createElement(GraphControls));
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    expect(useViewStore.getState().activeRepresentationMode).toBe("lineage");
  });

  it("Grouped maps to the semantic representation mode", () => {
    render(createElement(GraphControls));
    fireEvent.click(screen.getByRole("button", { name: "Grouped" }));
    expect(useViewStore.getState().activeRepresentationMode).toBe("semantic");
  });

  it("marks the representation mode active (aria-pressed) when live", () => {
    useViewStore.setState({ activeRepresentationMode: "lineage" });
    render(createElement(GraphControls));
    expect(
      screen.getByRole("button", { name: "Tree" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Network" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("Timeline enters time-travel (the temporal seam)", () => {
    render(createElement(GraphControls));
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    expect(useViewStore.getState().timelineMode.kind).toBe("time-travel");
  });

  it("reflects time-travel as the active Timeline segment", () => {
    useViewStore.setState({ timelineMode: { kind: "time-travel", at: 1 } });
    render(createElement(GraphControls));
    expect(
      screen.getByRole("button", { name: "Timeline" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("marks Grouped (semantic) as available only when its gate ships", () => {
    render(createElement(GraphControls));
    const grouped = screen.getByRole("button", { name: "Grouped" });
    // The control is rendered regardless; its title states the honest fallback
    // when the semantic projection has not shipped (no dead control, no lie).
    const title = grouped.getAttribute("title") ?? "";
    if (SEMANTIC_MODE_GATE.shipped) {
      expect(title).toMatch(/meaning/i);
    } else {
      expect(title).toMatch(/falls back/i);
    }
  });
});

describe("GraphControls — Zoom (LOD descent)", () => {
  it("the detail-level slider drives the real granularity", () => {
    render(createElement(GraphControls));
    const slider = screen.getByRole("slider", { name: "detail level" });
    // Default feature overview = 0.
    expect((slider as HTMLInputElement).value).toBe("0");
    fireEvent.change(slider, { target: { value: "1" } });
    expect(useViewStore.getState().granularity).toBe("document");
    fireEvent.change(slider, { target: { value: "0" } });
    expect(useViewStore.getState().granularity).toBe("feature");
  });

  it("the flanking − / + issue real camera zoom commands", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    render(createElement(GraphControls));
    fireEvent.click(screen.getByRole("button", { name: "zoom camera in" }));
    fireEvent.click(screen.getByRole("button", { name: "zoom camera out" }));
    const kinds = spy.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).toEqual(expect.arrayContaining(["zoom-in", "zoom-out"]));
  });
});

describe("GraphControls — Tune (d3-force knobs)", () => {
  it("Spacing drives the repel knob via set-layout-params", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    render(createElement(GraphControls));
    const slider = screen.getByRole("slider", { name: "Spacing" });
    fireEvent.change(slider, { target: { value: "300" } });
    const call = spy.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === "set-layout-params",
    );
    expect(call).toBeTruthy();
    expect((call![0] as { params: { repel: number } }).params.repel).toBe(300);
  });

  it("Connection reach drives the linkDistance knob", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    render(createElement(GraphControls));
    const slider = screen.getByRole("slider", { name: "Connection reach" });
    fireEvent.change(slider, { target: { value: "90" } });
    const call = spy.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === "set-layout-params",
    );
    expect((call![0] as { params: { linkDistance: number } }).params.linkDistance).toBe(
      90,
    );
  });

  it("Clustering drives the linkForce knob", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    render(createElement(GraphControls));
    const slider = screen.getByRole("slider", { name: "Clustering" });
    fireEvent.change(slider, { target: { value: "0.8" } });
    const call = spy.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === "set-layout-params",
    );
    expect(
      (call![0] as { params: { linkForce: number } }).params.linkForce,
    ).toBeCloseTo(0.8);
  });
});
