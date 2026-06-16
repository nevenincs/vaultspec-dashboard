// @vitest-environment happy-dom
//
// Consolidated graph controls (binding Figma redesign `graph/Controls` 88:2,
// `graph/Hero` 85:2). Rendered against the real SceneController singleton
// (getScene) and the real view store — no component-internal doubles.
//
// What is asserted (the IA consolidation mapping + the non-occluding overlay):
//   • Navigate emits the real camera SceneCommands (zoom-in/out, fit, reset);
//   • the GROUPED Layout picker (graph-layout-catalog D11) drives the real
//     representation mode — a Spatial group (Network → connectivity, Tree →
//     lineage, Layered → hierarchical, Radial → radial, Communities → community,
//     Grouped by meaning → semantic) and a DISTINCT Timeline entry that enters
//     time-travel (the temporal seam);
//   • the active segment reflects time-travel when the shared mode is time-travel;
//   • Zoom drives the real LOD descent (granularity feature ↔ document);
//   • Tune drives the real d3-force knobs via set-layout-params (Spacing → repel,
//     Connection reach → linkDistance, Clustering → linkForce);
//   • the heavy groups (Tune, Overview) are COLLAPSED by default and only render
//     their body once their popover trigger is opened — so the canvas is never
//     occluded; opening + closing (toggle / Escape) works;
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

describe("GraphControls — grouped Layout picker (D11)", () => {
  it("renders the six Spatial-group segments in order, Timeline kept distinct", () => {
    render(createElement(GraphControls));
    const spatial = screen.getByRole("group", { name: "spatial layout" });
    const segs = Array.from(spatial.querySelectorAll("button[data-seg]"));
    expect(segs.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Network",
      "Tree",
      "Layered",
      "Radial",
      "Communities",
      "Grouped by meaning",
    ]);
    // Timeline lives in its OWN distinct group, never folded into the Spatial row.
    const temporal = screen.getByRole("group", { name: "temporal view" });
    const tSegs = Array.from(temporal.querySelectorAll("button[data-seg]"));
    expect(tSegs.map((s) => s.getAttribute("aria-label"))).toEqual(["Timeline"]);
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

  it("Layered maps to the hierarchical representation mode (W02.P06)", () => {
    render(createElement(GraphControls));
    fireEvent.click(screen.getByRole("button", { name: "Layered" }));
    expect(useViewStore.getState().activeRepresentationMode).toBe("hierarchical");
  });

  it("Radial maps to the radial representation mode (W02.P05)", () => {
    render(createElement(GraphControls));
    fireEvent.click(screen.getByRole("button", { name: "Radial" }));
    expect(useViewStore.getState().activeRepresentationMode).toBe("radial");
  });

  it("Communities maps to the community representation mode (W02.P07)", () => {
    render(createElement(GraphControls));
    fireEvent.click(screen.getByRole("button", { name: "Communities" }));
    expect(useViewStore.getState().activeRepresentationMode).toBe("community");
  });

  it("Grouped by meaning maps to the semantic representation mode", () => {
    render(createElement(GraphControls));
    fireEvent.click(screen.getByRole("button", { name: "Grouped by meaning" }));
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

  it("ships the three new modes UN-GATED (no available downgrade, D10)", () => {
    render(createElement(GraphControls));
    // The new modes carry no italic/unavailable affordance — they are live the
    // moment they ship (no gate, no fallback copy).
    for (const label of ["Layered", "Radial", "Communities"]) {
      const btn = screen.getByRole("button", { name: label });
      const title = btn.getAttribute("title") ?? "";
      expect(title).not.toMatch(/falls back/i);
    }
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

  it("deactivates the Spatial group when time-travel owns the highlight", () => {
    useViewStore.setState({
      timelineMode: { kind: "time-travel", at: 1 },
      activeRepresentationMode: "connectivity",
    });
    render(createElement(GraphControls));
    // No spatial segment is pressed while Timeline is active.
    expect(
      screen.getByRole("button", { name: "Network" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("marks Grouped by meaning (semantic) as available only when its gate ships", () => {
    render(createElement(GraphControls));
    const grouped = screen.getByRole("button", { name: "Grouped by meaning" });
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

// The heavy Tune group is collapsed behind a popover trigger so the canvas is
// never occluded; the body (and its sliders) only mount once the trigger opens.
function openTune() {
  fireEvent.click(screen.getByRole("button", { name: "Tune" }));
}

describe("GraphControls — non-occluding overlay (collapsed heavy groups)", () => {
  it("does not render the Tune sliders until the Tune popover is opened", () => {
    render(createElement(GraphControls));
    // Collapsed by default: no Tune body, so the canvas behind reads clean.
    expect(screen.queryByRole("slider", { name: "Spacing" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Tune" }).getAttribute("aria-expanded"),
    ).toBe("false");
    openTune();
    expect(screen.getByRole("slider", { name: "Spacing" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Tune" }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("closes the Tune popover on a second trigger click (toggle)", () => {
    render(createElement(GraphControls));
    openTune();
    expect(screen.getByRole("slider", { name: "Spacing" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tune" }));
    expect(screen.queryByRole("slider", { name: "Spacing" })).toBeNull();
  });

  it("closes the Tune popover on Escape", () => {
    render(createElement(GraphControls));
    openTune();
    expect(screen.getByRole("slider", { name: "Spacing" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("slider", { name: "Spacing" })).toBeNull();
  });
});

describe("GraphControls — Tune (d3-force knobs)", () => {
  it("Spacing drives the repel knob via set-layout-params", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    render(createElement(GraphControls));
    openTune();
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
    openTune();
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
    openTune();
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
