// @vitest-environment happy-dom
//
// Graph overlay controls (binding Figma redesign `graph/Hero` 213:505 +
// `graph/Sim + Display controls` 714:2630 + `NavControls/Vertical` 260:839).
// Rendered against the real SceneController singleton (getScene), real
// dashboard-state, and real view scope — no component-internal doubles.
//
// The graph top bar is RETIRED: navigation is the bottom-left vertical camera
// cluster (GraphNavControls) and tuning lives in a top-right "Graph controls" panel
// (GraphSettingsPanel), collapsed by default so the field is never occluded:
//   • Navigate emits the real camera SceneCommands (zoom-in/out, fit, reset);
//   • the settings panel is COLLAPSED by default and only renders its body once
//     opened — opening + closing (toggle / Escape) works;
//   • the LAYOUT sliders (Spacing / Link length / Grouping) emit set-force-params
//     (Spacing → −charge; distance / spring straight through);
//   • the APPEARANCE controls emit set-appearance-params;
//   • freezing the scene clears when the active scope changes;
//   • the controls read + write only stores / the scene seam, never fetch.

import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createLiveClient, liveScope } from "../../testing/liveClient";
import { dashboardDocumentStateResetPatch } from "../../stores/server/dashboardState";
import { queryClient } from "../../stores/server/queryClient";
import { resetGraphControlsChrome } from "../../stores/view/graphControlsChrome";
import { useViewStore } from "../../stores/view/viewStore";
import { GraphNavControls, GraphSettingsPanel } from "./GraphControls";
import { getScene } from "./Stage";
import { ENGINE_WAIT } from "../../testing/timing";

let scope: string;

beforeAll(async () => {
  scope = await liveScope();
});

beforeEach(async () => {
  useViewStore.getState().setScope(scope);
  await createLiveClient().patchDashboardState(dashboardDocumentStateResetPatch(scope));
});

afterEach(async () => {
  cleanup();
  resetGraphControlsChrome();
  queryClient.clear();
  vi.restoreAllMocks();
  await createLiveClient()
    .patchDashboardState(dashboardDocumentStateResetPatch(scope))
    .catch(() => undefined);
});

afterAll(() => {
  useViewStore.getState().setScope(null);
});

function renderGraphControls() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        "div",
        null,
        createElement(GraphNavControls),
        createElement(GraphSettingsPanel),
      ),
    ),
  );
}

// The settings panel is collapsed behind a top-right trigger so the canvas is never
// occluded; its body (the Freeze switch + sliders) only mounts once the trigger opens.
function openSettings() {
  fireEvent.click(screen.getByRole("button", { name: "Graph controls" }));
}

describe("GraphNavControls — Navigate (camera commands)", () => {
  it("emits the four navigation SceneCommands (zoom in/out, fit, autoframe)", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();

    // The vertical nav cluster (binding NavControls/Vertical 260:839): zoom in /
    // zoom out · fit to view · Autoframe toggle. The redesign replaced the old
    // one-shot "Reset View" with the Autoframe toggle (emits set-autoframe).
    fireEvent.click(screen.getByRole("button", { name: "Zoom In" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom Out" }));
    fireEvent.click(screen.getByRole("button", { name: "Fit to View" }));
    fireEvent.click(screen.getByRole("button", { name: "Autoframe" }));

    const kinds = spy.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).toEqual(
      expect.arrayContaining(["zoom-in", "zoom-out", "fit-to-view", "set-autoframe"]),
    );
  });
});

describe("GraphSettingsPanel — non-occluding overlay (collapsed by default)", () => {
  it("does not render the panel body until the trigger is opened", () => {
    renderGraphControls();
    // Collapsed by default: no panel body, so the canvas behind reads clean.
    expect(screen.queryByRole("switch", { name: "Freeze Layout" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Graph controls" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    openSettings();
    expect(screen.getByRole("switch", { name: "Freeze Layout" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Graph controls" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("closes the panel on a second trigger click (toggle)", () => {
    renderGraphControls();
    openSettings();
    expect(screen.getByRole("switch", { name: "Freeze Layout" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Graph controls" }));
    expect(screen.queryByRole("switch", { name: "Freeze Layout" })).toBeNull();
  });

  it("closes the panel on Escape", () => {
    renderGraphControls();
    openSettings();
    expect(screen.getByRole("switch", { name: "Freeze Layout" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("switch", { name: "Freeze Layout" })).toBeNull();
  });
});

describe("GraphSettingsPanel — layout tuning (set-force-params)", () => {
  it("a Spacing slider change emits set-force-params with the mapped d3 charge", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();
    openSettings();
    const slider = screen.getByRole("slider", { name: "Spacing" });
    fireEvent.change(slider, { target: { value: "200" } });
    const call = spy.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === "set-force-params",
    );
    expect(call).toBeTruthy();
    // Spacing is a magnitude → a NEGATIVE charge on the d3-force field.
    expect((call![0] as { params: { charge: number } }).params.charge).toBeCloseTo(
      -200,
    );
  });

  it("Link length / Grouping map straight through to the field params", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();
    openSettings();
    fireEvent.change(screen.getByRole("slider", { name: "Link length" }), {
      target: { value: "120" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "Grouping" }), {
      target: { value: "1.5" },
    });
    const params = spy.mock.calls
      .filter((c) => (c[0] as { kind: string }).kind === "set-force-params")
      .map(
        (c) =>
          (c[0] as { params: { linkDistance?: number; linkStrength?: number } }).params,
      );
    expect(params.some((p) => p.linkDistance === 120)).toBe(true);
    expect(params.some((p) => p.linkStrength === 1.5)).toBe(true);
  });
});

describe("GraphSettingsPanel — appearance (set-appearance-params)", () => {
  it("a Node size slider change emits set-appearance-params", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();
    openSettings();
    fireEvent.change(screen.getByRole("slider", { name: "Node size" }), {
      target: { value: "1.5" },
    });
    const call = spy.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === "set-appearance-params",
    );
    expect(call).toBeTruthy();
    expect(
      (call![0] as { params: { nodeSizeScale: number } }).params.nodeSizeScale,
    ).toBeCloseTo(1.5);
  });

  it("the link-colour toggle emits set-appearance-params with the chosen mode", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();
    openSettings();
    fireEvent.click(screen.getByRole("radio", { name: "Solid" }));
    const call = spy.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === "set-appearance-params",
    );
    expect(call).toBeTruthy();
    expect(
      (call![0] as { params: { edgeColorMode: string } }).params.edgeColorMode,
    ).toBe("solid");
  });
});

describe("GraphSettingsPanel — Show (node-level / granularity switch)", () => {
  it("renders the Features / Documents node-level toggle in the established vocabulary", () => {
    renderGraphControls();
    openSettings();
    expect(screen.getByRole("radio", { name: "Features" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Documents" })).toBeTruthy();
    // The dropped Emphasis/lens toggle is gone (it changed nothing visible).
    expect(screen.queryByRole("radio", { name: "Status" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Design" })).toBeNull();
  });

  it("switching to Features writes graph_granularity and the active segment reflects the served state", async () => {
    renderGraphControls();
    openSettings();
    // The reset patch seeds document granularity, so Documents starts active once
    // the served dashboard-state loads.
    await waitFor(
      () =>
        expect(
          screen.getByRole("radio", { name: "Documents" }).getAttribute("aria-checked"),
        ).toBe("true"),
      ENGINE_WAIT,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Features" }));
    // The click writes graph_granularity=feature through the stage-controls intent;
    // the graph slice re-keys and the active segment flips once the served state
    // round-trips (display-state-is-backend-served — read back, not optimistic-only).
    await waitFor(
      () =>
        expect(
          screen.getByRole("radio", { name: "Features" }).getAttribute("aria-checked"),
        ).toBe("true"),
      ENGINE_WAIT,
    );
    const state = await createLiveClient().dashboardState(scope);
    expect(state?.graph_granularity).toBe("feature");
  });
});

describe("GraphSettingsPanel — Freeze toggle", () => {
  it("unfreezes the scene when the active scope changes", async () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();
    openSettings();

    fireEvent.click(screen.getByRole("switch", { name: "Freeze Layout" }));
    expect(
      spy.mock.calls.some(
        (c) =>
          (c[0] as { kind: string; frozen?: boolean }).kind === "set-frozen" &&
          (c[0] as { frozen?: boolean }).frozen === true,
      ),
    ).toBe(true);

    act(() => useViewStore.getState().setScope(null));

    await waitFor(() => {
      expect(
        spy.mock.calls.some(
          (c) =>
            (c[0] as { kind: string; frozen?: boolean }).kind === "set-frozen" &&
            (c[0] as { frozen?: boolean }).frozen === false,
        ),
      ).toBe(true);
    }, ENGINE_WAIT);
  });
});
