import { beforeEach, describe, expect, it } from "vitest";

import {
  GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
  GRAPH_CONTROLS_TUNE_DEFAULTS,
  deriveGraphControlsAppearancePresentationView,
  deriveGraphControlsBoundPresentationView,
  deriveGraphControlsFreezeToggleView,
  deriveGraphControlsNavigationView,
  deriveGraphControlsSettingsPopoverView,
  deriveGraphControlsTunePresentationView,
  formatGraphControlsAppearanceValue,
  formatGraphControlsBoundSize,
  formatGraphControlsTuneValue,
  normalizeGraphControlsAppearanceParams,
  normalizeGraphControlsFrozenScope,
  normalizeGraphControlsTuneParams,
  patchGraphControlsAppearanceParams,
  patchGraphControlsTuneParams,
  resetGraphControlsChrome,
  setGraphControlsAppearanceParams,
  setGraphControlsFrozen,
  setGraphControlsSettingsOpen,
  setGraphControlsTuneParams,
  toggleGraphControlsSettingsOpen,
  useGraphControlsChromeStore,
} from "./graphControlsChrome";
import { specById } from "../../scene/three/graphControlSchema";

describe("graph controls chrome view seam", () => {
  beforeEach(() => resetGraphControlsChrome());

  it("defaults graph settings to closed", () => {
    expect(useGraphControlsChromeStore.getState().settingsOpen).toBe(false);
  });

  it("sets, toggles, and resets graph settings open state through one seam", () => {
    setGraphControlsSettingsOpen(true);
    expect(useGraphControlsChromeStore.getState().settingsOpen).toBe(true);

    setGraphControlsSettingsOpen("true");
    expect(useGraphControlsChromeStore.getState().settingsOpen).toBe(false);

    toggleGraphControlsSettingsOpen();
    expect(useGraphControlsChromeStore.getState().settingsOpen).toBe(true);

    toggleGraphControlsSettingsOpen();
    expect(useGraphControlsChromeStore.getState().settingsOpen).toBe(false);

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
    setGraphControlsFrozen(true, " scope-a ");
    expect(useGraphControlsChromeStore.getState().frozen).toBe(true);
    expect(useGraphControlsChromeStore.getState().frozenScope).toBe("scope-a");

    setGraphControlsFrozen(false, null);
    expect(useGraphControlsChromeStore.getState().frozen).toBe(false);
    expect(useGraphControlsChromeStore.getState().frozenScope).toBeNull();

    setGraphControlsFrozen("true", { scope: "scope-a" });
    expect(useGraphControlsChromeStore.getState().frozen).toBe(false);
    expect(useGraphControlsChromeStore.getState().frozenScope).toBeNull();
    expect(normalizeGraphControlsFrozenScope("  scope-b  ")).toBe("scope-b");
    expect(normalizeGraphControlsFrozenScope("   ")).toBeNull();
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

  it("projects the three force sliders, derived from the schema (charge→repulsion remap)", () => {
    const view = deriveGraphControlsTunePresentationView();
    const charge = specById("charge")!;
    const linkDistance = specById("linkDistance")!;
    const linkStrength = specById("linkStrength")!;
    // Repulsion is the magnitude: the signed `charge` range negated + swapped.
    expect(view.sliders.repulsion).toEqual({
      label: charge.label,
      title: "How far nodes push each other apart",
      min: -charge.max!,
      max: -charge.min!,
      step: charge.step!,
    });
    expect(view.sliders.linkDistance).toMatchObject({
      label: linkDistance.label,
      min: linkDistance.min!,
      max: linkDistance.max!,
      step: linkDistance.step!,
    });
    expect(view.sliders.linkSpring).toMatchObject({
      label: linkStrength.label,
      min: linkStrength.min!,
      max: linkStrength.max!,
      step: linkStrength.step!,
    });
  });

  it("formats force readouts at the schema step precision", () => {
    expect(formatGraphControlsTuneValue("repulsion", 119.6)).toBe("120"); // charge step 5
    expect(formatGraphControlsTuneValue("linkDistance", 40)).toBe("40"); // step 1
    expect(formatGraphControlsTuneValue("linkSpring", 1.5)).toBe("1.50"); // linkStrength step 0.05
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
    expect(normalizeGraphControlsTuneParams({ repulsion: "200" })).toEqual(
      GRAPH_CONTROLS_TUNE_DEFAULTS,
    );
  });
});

describe("graph controls appearance seam (set-appearance-params)", () => {
  beforeEach(() => resetGraphControlsChrome());

  it("defaults appearance to the field's look (gradient edges per ADR D2)", () => {
    expect(GRAPH_CONTROLS_APPEARANCE_DEFAULTS).toEqual({
      nodeSizeScale: 1,
      nodeSalienceScale: 1,
      edgeWidthMin: 0.6,
      edgeWidthMax: 2.2,
      edgeOpacityMin: 0.1,
      edgeOpacityMax: 0.5,
      edgeColorMode: "gradient",
    });
    expect(useGraphControlsChromeStore.getState().appearanceParams).toEqual(
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
    );
  });

  it("projects the four exposed appearance sliders (schema-derived) + colour-mode copy", () => {
    const view = deriveGraphControlsAppearancePresentationView();
    expect(Object.keys(view.sliders).sort()).toEqual([
      "edgeOpacityMax",
      "edgeWidthMax",
      "nodeSalienceScale",
      "nodeSizeScale",
    ]);
    const nodeSize = specById("nodeSizeScale")!;
    expect(view.sliders.nodeSizeScale).toMatchObject({
      label: nodeSize.label,
      min: nodeSize.min!,
      max: nodeSize.max!,
      step: nodeSize.step!,
    });
    expect(view.colorModeLabel).toBe(specById("edgeColorMode")!.label);
    expect(view.solidLabel).toBe("Solid");
    expect(view.gradientLabel).toBe("Gradient");
  });

  it("formats appearance readouts at the schema step precision", () => {
    expect(formatGraphControlsAppearanceValue("edgeOpacityMax", 0.5)).toBe("0.50"); // step 0.02
    expect(formatGraphControlsAppearanceValue("nodeSizeScale", 1)).toBe("1.00"); // step 0.05
    expect(formatGraphControlsAppearanceValue("edgeWidthMax", 2.2)).toBe("2.2"); // step 0.1
  });

  it("sets, patches, normalizes, and resets appearance through one seam", () => {
    setGraphControlsAppearanceParams({
      nodeSizeScale: 1.5,
      nodeSalienceScale: 0.5,
      edgeWidthMin: 0.6,
      edgeWidthMax: 4,
      edgeOpacityMin: 0.1,
      edgeOpacityMax: 0.8,
      edgeColorMode: "solid",
    });
    expect(useGraphControlsChromeStore.getState().appearanceParams).toMatchObject({
      nodeSizeScale: 1.5,
      edgeWidthMax: 4,
      edgeColorMode: "solid",
    });

    // A patch merges; a non-finite number and an invalid mode fall back to defaults.
    patchGraphControlsAppearanceParams({
      edgeWidthMax: Number.NaN,
      edgeColorMode: "rainbow",
    });
    expect(useGraphControlsChromeStore.getState().appearanceParams).toMatchObject({
      nodeSizeScale: 1.5,
      edgeWidthMax: GRAPH_CONTROLS_APPEARANCE_DEFAULTS.edgeWidthMax,
      edgeColorMode: "gradient",
    });

    resetGraphControlsChrome();
    expect(useGraphControlsChromeStore.getState().appearanceParams).toEqual(
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
    );
    expect(normalizeGraphControlsAppearanceParams(null)).toEqual(
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
    );
  });
});
