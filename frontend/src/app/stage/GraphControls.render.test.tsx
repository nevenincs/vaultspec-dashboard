// @vitest-environment happy-dom
//
// Consolidated graph controls (binding Figma redesign `graph/Controls` 88:2,
// `graph/Hero` 85:2). Rendered against the real SceneController singleton
// (getScene), real dashboard-state, and real view scope — no component-internal
// doubles.
//
// Post-Cosmos: the set-cosmos-config seam, the canvas-bound control, and the
// retired LayoutSelector / representation-mode picker were removed; the force
// controls are rebuilt THREE-NATIVE against the field's `set-force-params` d3-force
// seam. The GraphControls surface is navigation + a collapsed settings popover
// (Freeze toggle + the force sliders):
//   • Navigate emits the real camera SceneCommands (zoom-in/out, fit, reset);
//   • the settings popover is COLLAPSED by default and only renders its body once
//     opened — so the canvas is never occluded; opening + closing (toggle / Escape)
//     works;
//   • the force sliders (Repulsion / Link distance / Link spring) emit
//     set-force-params (repulsion → −charge; distance / spring straight through);
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
import { GraphNavButtons, GraphSettingsPopover } from "./GraphControls";
import { getScene } from "./Stage";

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
        createElement(GraphNavButtons),
        createElement(GraphSettingsPopover),
      ),
    ),
  );
}

// The settings popover is collapsed behind a gear trigger so the canvas is never
// occluded; its body (the Freeze toggle) only mounts once the trigger opens.
function openSettings() {
  fireEvent.click(screen.getByRole("button", { name: "Graph settings" }));
}

describe("GraphControls — Navigate (camera commands)", () => {
  it("emits the four camera SceneCommands", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();

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

describe("GraphControls — non-occluding overlay (collapsed settings popover)", () => {
  it("does not render the Freeze toggle until the settings popover is opened", () => {
    renderGraphControls();
    // Collapsed by default: no popover body, so the canvas behind reads clean.
    expect(screen.queryByRole("button", { name: "freeze simulation" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Graph settings" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    openSettings();
    expect(screen.getByRole("button", { name: "freeze simulation" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Graph settings" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("closes the settings popover on a second trigger click (toggle)", () => {
    renderGraphControls();
    openSettings();
    expect(screen.getByRole("button", { name: "freeze simulation" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Graph settings" }));
    expect(screen.queryByRole("button", { name: "freeze simulation" })).toBeNull();
  });

  it("closes the settings popover on Escape", () => {
    renderGraphControls();
    openSettings();
    expect(screen.getByRole("button", { name: "freeze simulation" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "freeze simulation" })).toBeNull();
  });
});

describe("GraphControls — force tuning (set-force-params)", () => {
  it("a Repulsion slider change emits set-force-params with the mapped d3 charge", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();
    openSettings();
    const slider = screen.getByRole("slider", { name: "Repulsion" });
    fireEvent.change(slider, { target: { value: "200" } });
    const call = spy.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === "set-force-params",
    );
    expect(call).toBeTruthy();
    // Repulsion is a magnitude → a NEGATIVE charge on the d3-force field.
    expect((call![0] as { params: { charge: number } }).params.charge).toBeCloseTo(
      -200,
    );
  });

  it("Link distance / Link spring map straight through to the field params", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();
    openSettings();
    fireEvent.change(screen.getByRole("slider", { name: "Link distance" }), {
      target: { value: "120" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "Link spring" }), {
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

describe("GraphControls — Freeze toggle", () => {
  it("unfreezes the scene when the active scope changes", async () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();
    openSettings();

    fireEvent.click(screen.getByRole("button", { name: "freeze simulation" }));
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
    });
  });
});
