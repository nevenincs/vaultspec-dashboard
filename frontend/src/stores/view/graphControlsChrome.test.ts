import { beforeEach, describe, expect, it } from "vitest";

import {
  GRAPH_CONTROLS_TUNE_DEFAULTS,
  deriveGraphControlsBoundPresentationView,
  deriveGraphControlsFreezeToggleView,
  deriveGraphControlsNavigationView,
  deriveGraphControlsSettingsPopoverView,
  deriveGraphControlsTunePresentationView,
  formatGraphControlsBoundSize,
  formatGraphControlsTuneValue,
  normalizeGraphControlsTuneParams,
  patchGraphControlsTuneParams,
  resetGraphControlsChrome,
  setGraphControlsFrozen,
  setGraphControlsSettingsOpen,
  setGraphControlsTuneParams,
  toggleGraphControlsSettingsOpen,
  useGraphControlsChromeStore,
} from "./graphControlsChrome";

describe("graph controls chrome view seam", () => {
  beforeEach(() => resetGraphControlsChrome());

  it("defaults graph settings to closed", () => {
    expect(useGraphControlsChromeStore.getState().settingsOpen).toBe(false);
  });

  it("sets, toggles, and resets graph settings open state through one seam", () => {
    setGraphControlsSettingsOpen(true);
    expect(useGraphControlsChromeStore.getState().settingsOpen).toBe(true);

    toggleGraphControlsSettingsOpen();
    expect(useGraphControlsChromeStore.getState().settingsOpen).toBe(false);

    toggleGraphControlsSettingsOpen();
    expect(useGraphControlsChromeStore.getState().settingsOpen).toBe(true);

    resetGraphControlsChrome();
    expect(useGraphControlsChromeStore.getState().settingsOpen).toBe(false);
  });

  it("projects graph settings popover view state for the stage renderer", () => {
    expect(deriveGraphControlsSettingsPopoverView(true, "Graph settings")).toEqual({
      active: true,
      ariaExpanded: true,
      panelVisible: true,
      panelAriaLabel: "Graph settings",
      panelClassName:
        "absolute bottom-full right-0 z-30 mb-fg-2 flex flex-col gap-fg-2 bg-paper-raised/95 p-fg-3 backdrop-blur-sm",
    });
    expect(deriveGraphControlsSettingsPopoverView(false, "Graph settings")).toEqual({
      active: false,
      ariaExpanded: false,
      panelVisible: false,
      panelAriaLabel: "Graph settings",
      panelClassName:
        "absolute bottom-full right-0 z-30 mb-fg-2 flex flex-col gap-fg-2 bg-paper-raised/95 p-fg-3 backdrop-blur-sm",
    });
  });

  it("projects canvas-bound presentation through one graph-controls chrome seam", () => {
    expect(deriveGraphControlsBoundPresentationView("free")).toEqual({
      containerClassName: "flex w-48 flex-col gap-fg-2",
      groupClassName: "flex flex-col gap-fg-1",
      labelClassName: "text-label text-ink-muted",
      label: "Canvas bound",
      shapeAriaLabel: "Canvas bound shape",
      freeLabel: "Free",
      circleLabel: "Circle",
      rectLabel: "Rect",
      showSizeControl: false,
      sizeLabel: "Bound size",
      sizeTitle: "Rectangle half-extent in world units; 0 = auto-fit",
      sizeMin: 0,
      sizeMax: 4000,
      sizeStep: 100,
    });

    expect(deriveGraphControlsBoundPresentationView("circle")).toMatchObject({
      showSizeControl: true,
      sizeTitle: "Circle radius in world units; 0 = auto-fit",
    });
    expect(deriveGraphControlsBoundPresentationView("rect")).toMatchObject({
      showSizeControl: true,
      sizeTitle: "Rectangle half-extent in world units; 0 = auto-fit",
    });
  });

  it("formats canvas-bound size values through the chrome seam", () => {
    expect(formatGraphControlsBoundSize(0)).toBe("auto");
    expect(formatGraphControlsBoundSize(1234.4)).toBe("1234");
    expect(formatGraphControlsBoundSize(1234.5)).toBe("1235");
  });

  it("projects freeze toggle action copy from state and availability", () => {
    expect(deriveGraphControlsFreezeToggleView(false, true)).toEqual({
      label: "freeze simulation",
      title: "pause the simulation in place",
    });
    expect(deriveGraphControlsFreezeToggleView(true, true)).toEqual({
      label: "resume simulation",
      title: "resume the simulation",
    });
    expect(deriveGraphControlsFreezeToggleView(false, false)).toEqual({
      label: "freeze simulation",
      title: "freeze is available in the Network layout",
    });
  });

  it("projects navigation action chrome through one seam", () => {
    expect(deriveGraphControlsNavigationView()).toEqual({
      containerClassName: "flex items-center gap-fg-0-5",
      ariaLabel: "Navigate",
      dividerClassName: "mx-fg-0-5 h-4 w-px bg-rule",
      zoomIn: { label: "zoom in" },
      zoomOut: { label: "zoom out" },
      fitToView: {
        label: "fit to view",
        title: "fit all nodes into the viewport",
      },
      resetView: {
        label: "reset view",
        title: "reset the camera to the origin",
      },
    });
  });

  it("tracks freeze state with the scope that froze the simulation", () => {
    setGraphControlsFrozen(true, "scope-a");
    expect(useGraphControlsChromeStore.getState().frozen).toBe(true);
    expect(useGraphControlsChromeStore.getState().frozenScope).toBe("scope-a");

    setGraphControlsFrozen(false, null);
    expect(useGraphControlsChromeStore.getState().frozen).toBe(false);
    expect(useGraphControlsChromeStore.getState().frozenScope).toBeNull();
  });
});

describe("graph controls tune seam (three-native force params)", () => {
  beforeEach(() => resetGraphControlsChrome());

  it("defaults the tune params to the field's d3-force defaults", () => {
    expect(GRAPH_CONTROLS_TUNE_DEFAULTS).toEqual({
      repulsion: 120,
      linkDistance: 40,
      linkSpring: 1,
    });
    expect(useGraphControlsChromeStore.getState().tuneParams).toEqual(
      GRAPH_CONTROLS_TUNE_DEFAULTS,
    );
  });

  it("projects the three force sliders with d3-native ranges", () => {
    const view = deriveGraphControlsTunePresentationView();
    expect(view.sliders.repulsion).toEqual({
      label: "Repulsion",
      title: "How far nodes push each other apart",
      min: 0,
      max: 400,
      step: 10,
    });
    expect(view.sliders.linkDistance).toMatchObject({ min: 5, max: 200, step: 5 });
    expect(view.sliders.linkSpring).toMatchObject({ min: 0, max: 3, step: 0.1 });
  });

  it("formats repulsion / link-distance as integers and link-spring to one decimal", () => {
    expect(formatGraphControlsTuneValue("repulsion", 119.6)).toBe("120");
    expect(formatGraphControlsTuneValue("linkDistance", 40)).toBe("40");
    expect(formatGraphControlsTuneValue("linkSpring", 1.5)).toBe("1.5");
  });

  it("sets, patches, normalizes, and resets the tune params through one seam", () => {
    setGraphControlsTuneParams({ repulsion: 200, linkDistance: 80, linkSpring: 1.5 });
    expect(useGraphControlsChromeStore.getState().tuneParams).toEqual({
      repulsion: 200,
      linkDistance: 80,
      linkSpring: 1.5,
    });

    // A patch merges and normalizes non-finite values back to the default.
    patchGraphControlsTuneParams({ linkDistance: Number.NaN, linkSpring: 2 });
    expect(useGraphControlsChromeStore.getState().tuneParams).toEqual({
      repulsion: 200,
      linkDistance: GRAPH_CONTROLS_TUNE_DEFAULTS.linkDistance,
      linkSpring: 2,
    });

    resetGraphControlsChrome();
    expect(useGraphControlsChromeStore.getState().tuneParams).toEqual(
      GRAPH_CONTROLS_TUNE_DEFAULTS,
    );
    expect(normalizeGraphControlsTuneParams(null)).toEqual(
      GRAPH_CONTROLS_TUNE_DEFAULTS,
    );
  });
});
