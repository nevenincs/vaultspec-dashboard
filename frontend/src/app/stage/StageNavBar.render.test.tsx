// @vitest-environment happy-dom
//
// The unified stage top bar (graph-timeline-workspace). Rendered against the real
// SceneController singleton (getScene), real dashboard-state, and real view scope —
// no component-internal doubles.
//
// What is asserted (the simplification contract):
//   • the bar carries ALL navigation — the graph camera cluster (zoom in/out, fit,
//     reset), the graph-settings gear, and the timeline cluster (zoom in/out, fit,
//     jump to now);
//   • the graph camera buttons emit the real camera SceneCommands;
//   • the bar carries NO search field, NO filter control, and NO layout/
//     representation "mode" switch — those were retired for visual clarity.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
import { StageNavBar } from "./StageNavBar";
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

function renderNavBar() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(StageNavBar),
    ),
  );
}

describe("StageNavBar — unified graph + timeline navigation", () => {
  it("renders the bar with all navigation clusters", () => {
    renderNavBar();
    expect(document.querySelector("[data-stage-nav-bar]")).toBeTruthy();
    // Graph camera cluster.
    for (const name of ["zoom in", "zoom out", "fit to view", "reset view"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    // Graph-settings gear (collapsed by default).
    expect(screen.getByRole("button", { name: "Graph settings" })).toBeTruthy();
    // Timeline cluster.
    for (const name of [
      "zoom in timeline",
      "zoom out timeline",
      "fit timeline",
      "jump to now",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("emits the graph camera SceneCommands", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderNavBar();
    fireEvent.click(screen.getByRole("button", { name: "zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "fit to view" }));
    const kinds = spy.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).toEqual(expect.arrayContaining(["zoom-in", "fit-to-view"]));
  });

  it("carries no search, filter, or layout-mode switch (the simplification)", () => {
    renderNavBar();
    // No text-match search field.
    expect(screen.queryByRole("textbox", { name: "text match filter" })).toBeNull();
    expect(screen.queryByPlaceholderText("Search documents…")).toBeNull();
    // No filter control.
    expect(screen.queryByRole("button", { name: /filter panel/i })).toBeNull();
    // No layout / representation "mode" switch.
    expect(document.querySelector("[data-layout-picker]")).toBeNull();
    for (const mode of ["Network", "Free", "Lineage", "Timeline"]) {
      expect(screen.queryByRole("button", { name: mode })).toBeNull();
    }
  });
});
