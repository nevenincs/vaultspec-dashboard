import { beforeEach, describe, expect, it } from "vitest";

import {
  GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
  GRAPH_CONTROLS_TUNE_DEFAULTS,
  deriveGraphControlsAppearancePresentationView,
  deriveGraphControlsFreezeToggleView,
  deriveGraphControlsNavigationView,
  deriveGraphControlsReflowToggleView,
  deriveGraphControlsSettingsPopoverView,
  deriveGraphControlsSimToggleView,
  deriveGraphControlsTunePresentationView,
  deriveGraphControlsViewPresentationView,
  normalizeGraphControlsAppearanceParams,
  normalizeGraphControlsFrozenScope,
  normalizeGraphControlsTuneParams,
  patchGraphControlsAppearanceParams,
  patchGraphControlsTuneParams,
  resetGraphControlsChrome,
  setGraphControlsAppearanceParams,
  setGraphControlsAppearanceOpen,
  setGraphControlsFrozen,
  setGraphControlsLayoutOpen,
  setGraphControlsSettingsOpen,
  setGraphControlsSimRunning,
  setGraphControlsTuneParams,
  toggleGraphControlsAppearanceOpen,
  toggleGraphControlsLayoutOpen,
  toggleGraphControlsSettingsOpen,
  toggleGraphReflowFilter,
  setGraphReflowFilter,
  useGraphControlsChromeStore,
} from "./graphControlsChrome";
import { specById } from "../../scene/three/graphControlSchema";
import {
  GRAPH_CONTROLS_MESSAGES,
  UI_GRAPH_CONTROL_MESSAGES,
} from "./graphControlsVocabulary";

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

  it("sets, toggles, and resets graph section disclosure through one seam", () => {
    expect(useGraphControlsChromeStore.getState()).toMatchObject({
      layoutOpen: true,
      appearanceOpen: true,
    });

    setGraphControlsLayoutOpen(false);
    setGraphControlsAppearanceOpen(false);
    expect(useGraphControlsChromeStore.getState()).toMatchObject({
      layoutOpen: false,
      appearanceOpen: false,
    });

    setGraphControlsLayoutOpen("false");
    setGraphControlsAppearanceOpen("false");
    expect(useGraphControlsChromeStore.getState()).toMatchObject({
      layoutOpen: false,
      appearanceOpen: false,
    });

    toggleGraphControlsLayoutOpen();
    toggleGraphControlsAppearanceOpen();
    expect(useGraphControlsChromeStore.getState()).toMatchObject({
      layoutOpen: true,
      appearanceOpen: true,
    });

    resetGraphControlsChrome();
    expect(useGraphControlsChromeStore.getState()).toMatchObject({
      layoutOpen: true,
      appearanceOpen: true,
    });
  });

  it("projects graph settings popover view state for the stage renderer", () => {
    expect(deriveGraphControlsSettingsPopoverView(true, GRAPH_CONTROLS_MESSAGES.title)).toEqual({
      active: true,
      ariaExpanded: true,
      panelVisible: true,
      panelAriaLabel: GRAPH_CONTROLS_MESSAGES.title,
      panelClassName:
        "absolute right-0 top-full z-30 mt-fg-1 flex w-[16.5rem] flex-col gap-fg-3 p-fg-3 backdrop-blur-sm",
    });
    expect(deriveGraphControlsSettingsPopoverView(false, GRAPH_CONTROLS_MESSAGES.title)).toEqual({
      active: false,
      ariaExpanded: false,
      panelVisible: false,
      panelAriaLabel: GRAPH_CONTROLS_MESSAGES.title,
      panelClassName:
        "absolute right-0 top-full z-30 mt-fg-1 flex w-[16.5rem] flex-col gap-fg-3 p-fg-3 backdrop-blur-sm",
    });
  });

  it("projects freeze toggle action copy from state and availability", () => {
    expect(deriveGraphControlsFreezeToggleView(false, true)).toEqual({
      label: GRAPH_CONTROLS_MESSAGES.labels.keepLayoutFixed,
      title: GRAPH_CONTROLS_MESSAGES.descriptions.keepLayoutFixed,
    });
    expect(deriveGraphControlsFreezeToggleView(true, true)).toEqual({
      label: GRAPH_CONTROLS_MESSAGES.labels.keepLayoutFixed,
      title: GRAPH_CONTROLS_MESSAGES.descriptions.keepLayoutFixed,
    });
    expect(deriveGraphControlsFreezeToggleView(false, false)).toEqual({
      label: GRAPH_CONTROLS_MESSAGES.labels.keepLayoutFixed,
      title: GRAPH_CONTROLS_MESSAGES.descriptions.settingUnavailableInHistory,
    });
  });

  it("projects sim play/pause action copy from the run-state mirror", () => {
    expect(deriveGraphControlsSimToggleView(false)).toEqual({
      label: GRAPH_CONTROLS_MESSAGES.actions.resumeMovement,
      title: GRAPH_CONTROLS_MESSAGES.actions.resumeMovement,
    });
    expect(deriveGraphControlsSimToggleView(true)).toEqual({
      label: GRAPH_CONTROLS_MESSAGES.actions.pauseMovement,
      title: GRAPH_CONTROLS_MESSAGES.actions.pauseMovement,
    });
  });

  it("mirrors the scene sim-state into the run flag, boolean-strict, reset to idle", () => {
    expect(useGraphControlsChromeStore.getState().simRunning).toBe(false);

    setGraphControlsSimRunning(true);
    expect(useGraphControlsChromeStore.getState().simRunning).toBe(true);

    // Only a real boolean true counts (the scene emits booleans; anything else idles).
    setGraphControlsSimRunning("true");
    expect(useGraphControlsChromeStore.getState().simRunning).toBe(false);

    setGraphControlsSimRunning(true);
    resetGraphControlsChrome();
    expect(useGraphControlsChromeStore.getState().simRunning).toBe(false);
  });

  it("projects navigation action chrome through one seam", () => {
    expect(deriveGraphControlsNavigationView()).toEqual({
      containerClassName: "flex flex-col items-center gap-fg-0-5",
      ariaLabel: GRAPH_CONTROLS_MESSAGES.accessibility.navigation,
      dividerClassName: "my-fg-0-5 h-px w-6 bg-rule",
      zoomIn: { label: GRAPH_CONTROLS_MESSAGES.actions.zoomIn },
      zoomOut: { label: GRAPH_CONTROLS_MESSAGES.actions.zoomOut },
      fitToView: {
        label: GRAPH_CONTROLS_MESSAGES.actions.fitToView,
        title: GRAPH_CONTROLS_MESSAGES.actions.fitToView,
      },
      autoframe: {
        label: GRAPH_CONTROLS_MESSAGES.actions.keepInView,
        titleOn: GRAPH_CONTROLS_MESSAGES.descriptions.keepInView,
        titleOff: GRAPH_CONTROLS_MESSAGES.descriptions.keepInView,
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

  it("sets, toggles, normalizes, and resets the reflow-filter flag", () => {
    expect(useGraphControlsChromeStore.getState().reflowFilter).toBe(false);

    setGraphReflowFilter(true);
    expect(useGraphControlsChromeStore.getState().reflowFilter).toBe(true);

    toggleGraphReflowFilter();
    expect(useGraphControlsChromeStore.getState().reflowFilter).toBe(false);

    // Non-boolean truthy normalizes to false (only a real boolean true enables it).
    setGraphReflowFilter("true");
    expect(useGraphControlsChromeStore.getState().reflowFilter).toBe(false);

    setGraphReflowFilter(true);
    resetGraphControlsChrome();
    expect(useGraphControlsChromeStore.getState().reflowFilter).toBe(false);
  });

  it("defaults autoframe ON and sets/toggles/normalizes/resets it", () => {
    // Default ON (graph-autoframe): the 4th nav button starts engaged.
    expect(useGraphControlsChromeStore.getState().autoframeEnabled).toBe(true);

    useGraphControlsChromeStore.getState().setAutoframe(false);
    expect(useGraphControlsChromeStore.getState().autoframeEnabled).toBe(false);

    useGraphControlsChromeStore.getState().toggleAutoframe();
    expect(useGraphControlsChromeStore.getState().autoframeEnabled).toBe(true);

    // Only a real boolean true enables it (non-boolean truthy normalizes to false).
    useGraphControlsChromeStore.getState().setAutoframe("true");
    expect(useGraphControlsChromeStore.getState().autoframeEnabled).toBe(false);

    resetGraphControlsChrome();
    expect(useGraphControlsChromeStore.getState().autoframeEnabled).toBe(true);
  });

  it("derives plain-language reflow toggle copy for each state", () => {
    expect(deriveGraphControlsReflowToggleView(false).label).toBe(
      GRAPH_CONTROLS_MESSAGES.actions.rearrangeAfterFiltering,
    );
    expect(deriveGraphControlsReflowToggleView(true).title).toBe(
      GRAPH_CONTROLS_MESSAGES.descriptions.rearrangeAfterFiltering,
    );
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
      label: UI_GRAPH_CONTROL_MESSAGES.charge.label,
      title: UI_GRAPH_CONTROL_MESSAGES.charge.description,
      min: -charge.max!,
      max: -charge.min!,
      step: charge.step!,
    });
    expect(view.sliders.linkDistance).toMatchObject({
      label: UI_GRAPH_CONTROL_MESSAGES.linkDistance.label,
      min: linkDistance.min!,
      max: linkDistance.max!,
      step: linkDistance.step!,
    });
    expect(view.sliders.linkSpring).toMatchObject({
      label: UI_GRAPH_CONTROL_MESSAGES.linkStrength.label,
      min: linkStrength.min!,
      max: linkStrength.max!,
      step: linkStrength.step!,
    });
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
      nodeColorMode: "category",
      nodeIcons: false,
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
      label: UI_GRAPH_CONTROL_MESSAGES.nodeSizeScale.label,
      min: nodeSize.min!,
      max: nodeSize.max!,
      step: nodeSize.step!,
    });
    expect(view.colorModeLabel).toBe(UI_GRAPH_CONTROL_MESSAGES.edgeColorMode.label);
    expect(view.solidLabel).toBe(GRAPH_CONTROLS_MESSAGES.options.solid);
    expect(view.gradientLabel).toBe(GRAPH_CONTROLS_MESSAGES.options.blended);
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

describe("graph controls View seam (granularity switch presentation)", () => {
  it("projects the Features / Documents node-level options in the established rail vocabulary", () => {
    const view = deriveGraphControlsViewPresentationView();
    expect(view.heading).toBe(GRAPH_CONTROLS_MESSAGES.sections.show);
    // The OPTION VALUES are the wire enums; the LABELS are the established
    // user-facing rail vocabulary (the left rail's Features / Documents sections),
    // not invented jargon — the wire keeps feature/document.
    expect(view.detailOptions.map((o) => o.value)).toEqual(["feature", "document"]);
    expect(view.detailOptions.map((o) => o.label)).toEqual([
      GRAPH_CONTROLS_MESSAGES.options.features,
      GRAPH_CONTROLS_MESSAGES.options.documents,
    ]);
    // Every option carries an explanatory tooltip, plus a one-line caption.
    expect(view.detailOptions.every((o) => "key" in o.title)).toBe(true);
    expect("key" in view.caption).toBe(true);
  });
});
