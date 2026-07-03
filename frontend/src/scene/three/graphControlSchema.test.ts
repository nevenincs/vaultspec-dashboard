import { describe, expect, it } from "vitest";

import {
  type ControlSpec,
  GRAPH_CONTROL_SCHEMA,
  MAX_GRAPH_CONTROL_OVERRIDES,
  appearanceDefaults,
  defaultsFor,
  normalizeGraphControlOverrides,
  resolveAppearanceParams,
  resolveForceParams,
  simulationDefaults,
} from "./graphControlSchema";

// Widen the `as const` schema to the ControlSpec interface for the generic field access
// in the loops below — the as-const literal types are too narrow for `.exposure.includes`
// ("never" on empty-exposure tuples) and the optional `uiLabel`.
const SCHEMA: readonly ControlSpec[] = GRAPH_CONTROL_SCHEMA;

// The canonical default of EVERY registry entry, pinned INDEPENDENTLY of the schema so
// an accidental default change is caught (algo-flagged: the entry defaults were the lone
// untested path). The whole point is the regression pin — update this map only when a
// default is changed DELIBERATELY.
const EXPECTED_DEFAULTS: Record<string, number | string | boolean> = {
  // --- simulation: d3-force params (17) ---
  charge: -120,
  linkDistance: 40,
  linkStrength: 1,
  chargeDistanceMax: 0,
  chargeTheta: 0.8,
  centerStrength: 0.06,
  collidePadding: 3,
  collideStrength: 0.8,
  collideIterations: 1,
  velocityDecay: 0.5,
  alphaDecay: 0.05,
  alphaMin: 0.005,
  dragAlpha: 0.3,
  wakeMove: 14,
  wakeRadius: 0,
  sleepSpeed: 0.4,
  sleepTicks: 18,
  // --- simulation: energy schedule (internal) ---
  coldAlpha: 1,
  warmReheatAlpha: 0.5,
  gentleReheatAlpha: 0.15,
  warmStartAlpha: 0.3,
  prewarmMaxTicks: 300,
  prewarmBudgetMs: 260,
  // --- visualisation: the 9 appearance params ---
  nodeSizeScale: 1,
  nodeSalienceScale: 1,
  edgeWidthMin: 0.6,
  edgeWidthMax: 2.2,
  edgeOpacityMin: 0.1,
  edgeOpacityMax: 0.5,
  edgeColorMode: "gradient",
  nodeColorMode: "category",
  nodeIcons: false,
  // --- visualisation: internal render constants ---
  baseNodeRadius: 4,
  salienceRadiusMax: 2.6,
  featureLevelScale: 0.6,
  documentLevelScale: 1.6,
  documentLabelSalienceFloor: 0.45,
  labelBudget: 220,
  nodeMinPx: 1.5,
  nodeMaxPx: 240,
  edgeMinPx: 1,
  edgeMaxPx: 64,
  pinnedRingWidth: 1.5,
  hoverRingWidth: 1.75,
  pulseRingWidth: 2.5,
  edgeUnknownTierAlphaMult: 0.6,
  edgeBrokenAlphaMult: 0.55,
  edgeStaleAlphaMult: 0.78,
  nodeDimMix: 0.72,
  nodeDimAlpha: 0.4,
  edgeDimMix: 0.6,
  edgeDimAlpha: 0.2,
  pulseRingAlpha: 0.85,
  nodeDegreeReference: 100,
  // --- navigation ---
  zoomMin: 0.02,
  zoomMax: 50,
  zoomStepButton: 1.2,
  zoomStepWheel: 1.1,
  fitPaddingPx: 40,
  minimapInset: 0.1,
  minimapWidth: 160,
  minimapHeight: 100,
  dragThresholdPx: 2,
  pickRadiusPx: 14,
  pinchZoomSensitivity: 0.01,
};

// Friendly UI labels for the ui-exposed entries — the redesign's binding plain-language
// vocabulary (ui-labels-are-user-facing). The schema is the single source apps-review
// derives the rendered label from; `label` stays the dev-lab vocabulary.
const EXPECTED_UI_LABELS: Record<string, string> = {
  charge: "Spacing",
  linkDistance: "Link length",
  linkStrength: "Grouping",
  nodeSizeScale: "Node size",
  nodeSalienceScale: "Importance",
  edgeWidthMax: "Link thickness",
  edgeOpacityMax: "Link opacity",
  edgeColorMode: "Link colour",
  nodeColorMode: "Node colour",
  nodeIcons: "Show icons",
};

describe("graphControlSchema defaults", () => {
  it("pins every entry's canonical default (no silent drift)", () => {
    const actual: Record<string, number | string | boolean> = {};
    for (const spec of GRAPH_CONTROL_SCHEMA) actual[spec.id] = spec.default;
    expect(actual).toEqual(EXPECTED_DEFAULTS);
  });

  it("has exactly the expected entry set (no added/removed entry untracked)", () => {
    const ids = GRAPH_CONTROL_SCHEMA.map((s) => s.id).sort();
    expect(ids).toEqual(Object.keys(EXPECTED_DEFAULTS).sort());
  });

  it("derives the typed simulation defaults (17 d3-force params) from the schema", () => {
    const sim = simulationDefaults();
    expect(Object.keys(sim)).toHaveLength(17);
    for (const [key, value] of Object.entries(sim)) {
      expect(value).toBe(EXPECTED_DEFAULTS[key]);
    }
  });

  it("derives the typed appearance defaults (9 params) from the schema", () => {
    const appearance = appearanceDefaults();
    expect(Object.keys(appearance)).toHaveLength(9);
    for (const [key, value] of Object.entries(appearance)) {
      expect(value).toBe(EXPECTED_DEFAULTS[key]);
    }
  });

  it("defaultsFor(group) returns each group's id→default slice", () => {
    for (const group of ["simulation", "visualisation", "navigation"] as const) {
      const slice = defaultsFor(group);
      expect(Object.keys(slice).length).toBeGreaterThan(0);
      for (const [id, def] of Object.entries(slice)) {
        expect(def).toBe(EXPECTED_DEFAULTS[id]);
      }
    }
  });
});

describe("graphControlSchema structure", () => {
  it("has unique ids", () => {
    const ids = GRAPH_CONTROL_SCHEMA.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("number entries keep min ≤ default ≤ max", () => {
    for (const spec of GRAPH_CONTROL_SCHEMA) {
      if (spec.type !== "number") continue;
      const { default: def, min, max } = spec;
      expect(typeof def).toBe("number");
      expect(typeof min).toBe("number");
      expect(typeof max).toBe("number");
      if (
        typeof def === "number" &&
        typeof min === "number" &&
        typeof max === "number"
      ) {
        expect(def).toBeGreaterThanOrEqual(min);
        expect(def).toBeLessThanOrEqual(max);
      }
    }
  });

  it("enum entries carry their default in options", () => {
    for (const spec of GRAPH_CONTROL_SCHEMA) {
      if (spec.type !== "enum") continue;
      expect(spec.options).toBeDefined();
      expect(spec.options ?? []).toContain(spec.default);
    }
  });

  it("exposure is a subset of {ui, lab}", () => {
    for (const spec of GRAPH_CONTROL_SCHEMA) {
      for (const exposure of spec.exposure) {
        expect(["ui", "lab"]).toContain(exposure);
      }
    }
  });
});

describe("graphControlSchema ui labels (single source for the curated UI)", () => {
  it("every ui-exposed entry carries its pinned friendly uiLabel", () => {
    for (const spec of SCHEMA) {
      if (!spec.exposure.includes("ui")) continue;
      expect(spec.uiLabel, `${spec.id} is ui-exposed and needs a uiLabel`).toBe(
        EXPECTED_UI_LABELS[spec.id],
      );
    }
  });

  it("the ui-exposed set is exactly the labelled set (no ui entry unlabelled)", () => {
    const uiIds = SCHEMA.filter((s) => s.exposure.includes("ui"))
      .map((s) => s.id)
      .sort();
    expect(uiIds).toEqual(Object.keys(EXPECTED_UI_LABELS).sort());
  });

  it("lab-only / internal entries carry no uiLabel (label is the lab vocabulary)", () => {
    for (const spec of SCHEMA) {
      if (spec.exposure.includes("ui")) continue;
      expect(spec.uiLabel).toBeUndefined();
    }
  });
});

describe("graph_controls overrides (normalize + resolve)", () => {
  it("keeps valid schema ids, clamps numbers, validates enum + boolean; drops the rest", () => {
    expect(
      normalizeGraphControlOverrides({
        charge: -300, // valid (in -600..0)
        linkDistance: 9999, // out of range -> clamp to 200
        edgeColorMode: "solid", // valid enum
        nodeIcons: true, // valid boolean
        nodeSizeScale: "big", // wrong type -> dropped
        unknownId: 5, // not a schema id -> dropped
        frozen: true, // not a schema id -> dropped
      }),
    ).toEqual({
      charge: -300,
      linkDistance: 200,
      edgeColorMode: "solid",
      nodeIcons: true,
    });
  });

  it("rejects a non-boolean value for a boolean control", () => {
    expect(normalizeGraphControlOverrides({ nodeIcons: "yes" })).toEqual({});
    expect(normalizeGraphControlOverrides({ nodeIcons: 1 })).toEqual({});
  });

  it("rejects an invalid enum value and non-finite numbers", () => {
    expect(normalizeGraphControlOverrides({ edgeColorMode: "rainbow" })).toEqual({});
    expect(
      normalizeGraphControlOverrides({ charge: Number.POSITIVE_INFINITY }),
    ).toEqual({});
  });

  it("returns {} for non-object payloads", () => {
    expect(normalizeGraphControlOverrides(null)).toEqual({});
    expect(normalizeGraphControlOverrides("x")).toEqual({});
    expect(normalizeGraphControlOverrides([1, 2])).toEqual({});
  });

  it("declares a bounded override cap", () => {
    expect(MAX_GRAPH_CONTROL_OVERRIDES).toBe(256);
  });

  it("resolveForceParams overlays simulation overrides on the schema defaults", () => {
    const base = simulationDefaults();
    const resolved = resolveForceParams({ charge: -300, linkDistance: 80 });
    expect(resolved.charge).toBe(-300);
    expect(resolved.linkDistance).toBe(80);
    expect(resolved.linkStrength).toBe(base.linkStrength);
  });

  it("resolveAppearanceParams overlays visualisation overrides on the schema defaults", () => {
    const base = appearanceDefaults();
    const resolved = resolveAppearanceParams({
      nodeSizeScale: 2,
      edgeColorMode: "solid",
    });
    expect(resolved.nodeSizeScale).toBe(2);
    expect(resolved.edgeColorMode).toBe("solid");
    expect(resolved.edgeWidthMax).toBe(base.edgeWidthMax);
  });
});
