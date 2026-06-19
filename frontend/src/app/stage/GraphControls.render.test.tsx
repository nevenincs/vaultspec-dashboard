// @vitest-environment happy-dom
//
// Consolidated graph controls (binding Figma redesign `graph/Controls` 88:2,
// `graph/Hero` 85:2). Rendered against the real SceneController singleton
// (getScene), real dashboard-state, and real view scope — no component-internal
// doubles.
//
// What is asserted (the IA consolidation mapping + the non-occluding overlay):
//   • Navigate emits the real camera SceneCommands (zoom-in/out, fit, reset);
//   • the GROUPED Layout picker (graph-layout-catalog D11) drives the real
//     representation mode through dashboard-state — a Spatial group (Network →
//     connectivity, Tree → lineage, Layered → hierarchical, Radial → radial,
//     Communities → community, Grouped by meaning → semantic) and a DISTINCT
//     Timeline entry that enters time-travel (the temporal seam);
//   • the active segment reflects time-travel when the shared mode is time-travel;
//   • Tune drives the real Cosmos knobs via set-cosmos-config.
//   • the heavy groups (Tune, Overview) are COLLAPSED by default and only render
//     their body once their popover trigger is opened — so the canvas is never
//     occluded; opening + closing (toggle / Escape) works;
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

import { SEMANTIC_MODE_GATE } from "../../scene/field/semanticGate";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { dashboardDocumentStateResetPatch } from "../../stores/server/dashboardState";
import { queryClient } from "../../stores/server/queryClient";
import { resetGraphControlsChrome } from "../../stores/view/graphControlsChrome";
import { useViewStore } from "../../stores/view/viewStore";
import { useTimelineStore } from "../../stores/view/timeline";
import { visibleRange } from "../timeline/scrollStrip";
import { GraphNavButtons, GraphSettingsPopover } from "./GraphControls";
import { LayoutSelector, timelineEntryInstant } from "./LensSelector";
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

function renderLayoutSelector() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(LayoutSelector),
    ),
  );
}

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

function renderGraphControlsWithLayoutSelector() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        "div",
        null,
        createElement(GraphNavButtons),
        createElement(GraphSettingsPopover),
        createElement(LayoutSelector),
      ),
    ),
  );
}

async function expectDashboardRepresentation(mode: string) {
  await waitFor(async () => {
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      representation_mode: mode,
    });
  });
}

async function expectDashboardTimelineKind(kind: "live" | "time-travel") {
  await waitFor(async () => {
    const state = await createLiveClient().dashboardState(scope);
    expect(state.timeline_mode.kind).toBe(kind);
  });
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

describe("LayoutSelector — grouped Layout picker (D11), in the toolbar", () => {
  it("derives the timeline entry instant from canonical date range before the viewport", () => {
    const now = Date.parse("2026-06-17T12:00:00Z");
    const dateRangeTo = "2026-06-15T09:00:00Z";
    expect(timelineEntryInstant({ to: dateRangeTo }, 0, 1, 800, now)).toBe(
      Date.parse(dateRangeTo),
    );
  });

  it("falls back to the scroll-strip visible range when canonical date range is open", () => {
    const state = useTimelineStore.getState();
    const expected = visibleRange(
      state.scrollOffset,
      state.viewportWidth,
      state.pxPerMs,
      0,
    ).toMs;
    expect(
      timelineEntryInstant(
        {},
        state.scrollOffset,
        state.pxPerMs,
        state.viewportWidth,
        Date.now(),
      ),
    ).toBeCloseTo(expected, 0);
  });

  it("falls back to now when the timeline viewport has not measured yet", () => {
    const now = Date.parse("2026-06-17T12:00:00Z");
    expect(timelineEntryInstant({}, 0, 0, 0, now)).toBe(now);
  });

  it("emits an integer instant for the backend timeline-mode contract", () => {
    expect(timelineEntryInstant({}, 0, 3, 1, 1000)).toBe(0);
  });

  it("renders the six Spatial-group segments in order, Timeline kept distinct", () => {
    renderLayoutSelector();
    const spatial = screen.getByRole("group", { name: "spatial layout" });
    const segs = Array.from(spatial.querySelectorAll("button[data-seg]"));
    expect(segs.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Free",
      "Lineage",
      "Hierarchy",
      "Radial",
      "Clusters",
      "Meaning",
    ]);
    // Timeline lives in its OWN distinct group, never folded into the Spatial row.
    const temporal = screen.getByRole("group", { name: "temporal view" });
    const tSegs = Array.from(temporal.querySelectorAll("button[data-seg]"));
    expect(tSegs.map((s) => s.getAttribute("aria-label"))).toEqual(["Timeline"]);
  });

  it("Free maps to the connectivity representation mode", async () => {
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      representation_mode: "lineage",
    });
    renderLayoutSelector();
    fireEvent.click(screen.getByRole("button", { name: "Free" }));
    await expectDashboardRepresentation("connectivity");
  });

  it("Lineage maps to the lineage representation mode", async () => {
    renderLayoutSelector();
    fireEvent.click(screen.getByRole("button", { name: "Lineage" }));
    await expectDashboardRepresentation("lineage");
  });

  it("Hierarchy maps to the hierarchical representation mode (W02.P06)", async () => {
    renderLayoutSelector();
    fireEvent.click(screen.getByRole("button", { name: "Hierarchy" }));
    await expectDashboardRepresentation("hierarchical");
  });

  it("Radial maps to the radial representation mode (W02.P05)", async () => {
    renderLayoutSelector();
    fireEvent.click(screen.getByRole("button", { name: "Radial" }));
    await expectDashboardRepresentation("radial");
  });

  it("Clusters maps to the community representation mode (W02.P07)", async () => {
    renderLayoutSelector();
    fireEvent.click(screen.getByRole("button", { name: "Clusters" }));
    await expectDashboardRepresentation("community");
  });

  it("Meaning maps to the semantic representation mode", async () => {
    renderLayoutSelector();
    fireEvent.click(screen.getByRole("button", { name: "Meaning" }));
    await expectDashboardRepresentation("semantic");
  });

  it("marks the representation mode active (aria-pressed) when live", async () => {
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      representation_mode: "lineage",
    });
    renderLayoutSelector();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Lineage" }).getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    expect(
      screen.getByRole("button", { name: "Free" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("ships the three new modes UN-GATED (no available downgrade, D10)", () => {
    renderLayoutSelector();
    // The new modes carry no italic/unavailable affordance — they are live the
    // moment they ship (no gate, no fallback copy).
    for (const label of ["Hierarchy", "Radial", "Clusters"]) {
      const btn = screen.getByRole("button", { name: label });
      const title = btn.getAttribute("title") ?? "";
      expect(title).not.toMatch(/falls back/i);
    }
  });

  it("Timeline enters time-travel (the temporal seam)", async () => {
    renderLayoutSelector();
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    await expectDashboardTimelineKind("time-travel");
    await expectDashboardRepresentation("temporal");
  });

  it("reflects time-travel as the active Timeline segment", async () => {
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      timeline_mode: { kind: "time-travel", at: 1 },
    });
    renderLayoutSelector();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Timeline" }).getAttribute("aria-pressed"),
      ).toBe("true"),
    );
  });

  it("returns to live through the timeline seam when a spatial mode is selected", async () => {
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      timeline_mode: { kind: "time-travel", at: 1 },
      representation_mode: "temporal",
    });
    renderLayoutSelector();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Timeline" }).getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Free" }));
    await expectDashboardTimelineKind("live");
    await expectDashboardRepresentation("connectivity");
  });

  it("deactivates the Spatial group when time-travel owns the highlight", async () => {
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      timeline_mode: { kind: "time-travel", at: 1 },
      representation_mode: "connectivity",
    });
    renderLayoutSelector();
    // No spatial segment is pressed while Timeline is active.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Free" }).getAttribute("aria-pressed"),
      ).toBe("false"),
    );
  });

  it("marks Meaning (semantic) as available only when its gate ships", () => {
    renderLayoutSelector();
    const grouped = screen.getByRole("button", { name: "Meaning" });
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

// The board's bottom-left cluster is NavControls-only (260:893): the LOD detail
// slider + flanking camera-zoom were retired from the canvas (the camera zoom
// in/out live in the Navigate group, asserted above).

// The heavy Tune group is collapsed behind a popover trigger so the canvas is
// never occluded; the body (and its sliders) only mount once the trigger opens.
function openTune() {
  fireEvent.click(screen.getByRole("button", { name: "Graph settings" }));
}

describe("GraphControls — non-occluding overlay (collapsed heavy groups)", () => {
  it("does not render the Tune sliders until the Tune popover is opened", () => {
    renderGraphControls();
    // Collapsed by default: no Tune body, so the canvas behind reads clean.
    expect(screen.queryByRole("slider", { name: "Repulsion" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Graph settings" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    openTune();
    expect(screen.getByRole("slider", { name: "Repulsion" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Graph settings" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("closes the Tune popover on a second trigger click (toggle)", () => {
    renderGraphControls();
    openTune();
    expect(screen.getByRole("slider", { name: "Repulsion" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Graph settings" }));
    expect(screen.queryByRole("slider", { name: "Repulsion" })).toBeNull();
  });

  it("closes the Tune popover on Escape", () => {
    renderGraphControls();
    openTune();
    expect(screen.getByRole("slider", { name: "Repulsion" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("slider", { name: "Repulsion" })).toBeNull();
  });
});

describe("GraphControls — dashboard graph bounds", () => {
  it("writes dashboard bounds intent without commanding the scene directly", async () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();
    openTune();

    fireEvent.click(screen.getByRole("radio", { name: "Rect" }));

    expect(
      spy.mock.calls.some((c) => (c[0] as { kind: string }).kind === "set-bounds"),
    ).toBe(false);
    await waitFor(async () => {
      await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
        graph_bounds: { shape: "rect", size: 0 },
      });
    });
    expect(
      spy.mock.calls.some((c) => (c[0] as { kind: string }).kind === "set-bounds"),
    ).toBe(false);
  });
});

describe("GraphControls — Tune (Cosmos knobs)", () => {
  it("unfreezes the scene when dashboard layout state leaves live Network", async () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControlsWithLayoutSelector();
    openTune();

    fireEvent.click(screen.getByRole("button", { name: "freeze simulation" }));
    expect(
      spy.mock.calls.some(
        (c) =>
          (c[0] as { kind: string; frozen?: boolean }).kind === "set-frozen" &&
          (c[0] as { frozen?: boolean }).frozen === true,
      ),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Lineage" }));

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

  it("unfreezes the scene when the active scope changes", async () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();
    openTune();

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

  it("Repulsion drives simulationRepulsion via set-cosmos-config", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();
    openTune();
    const slider = screen.getByRole("slider", { name: "Repulsion" });
    fireEvent.change(slider, { target: { value: "1.5" } });
    const call = spy.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === "set-cosmos-config",
    );
    expect(call).toBeTruthy();
    expect(
      (call![0] as { config: { simulationRepulsion: number } }).config
        .simulationRepulsion,
    ).toBeCloseTo(1.5);
  });

  it("Link distance drives simulationLinkDistance", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();
    openTune();
    const slider = screen.getByRole("slider", { name: "Link distance" });
    fireEvent.change(slider, { target: { value: "14" } });
    const call = spy.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === "set-cosmos-config",
    );
    expect(
      (call![0] as { config: { simulationLinkDistance: number } }).config
        .simulationLinkDistance,
    ).toBe(14);
  });

  it("Link spring drives simulationLinkSpring", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderGraphControls();
    openTune();
    const slider = screen.getByRole("slider", { name: "Link spring" });
    fireEvent.change(slider, { target: { value: "1.4" } });
    const call = spy.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === "set-cosmos-config",
    );
    expect(
      (call![0] as { config: { simulationLinkSpring: number } }).config
        .simulationLinkSpring,
    ).toBeCloseTo(1.4);
  });
});
