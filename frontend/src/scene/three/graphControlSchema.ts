import type { D3ForceParams } from "./d3ForceSolver";
import type { AppearanceParams, EdgeColorMode, NodeColorMode } from "./appearance";

export type ControlGroup = "simulation" | "visualisation" | "navigation";
export type ControlExposure = "ui" | "lab";

export interface ControlSpec {
  id: string;
  group: ControlGroup;
  type: "number" | "enum" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  default: number | string | boolean;
  exposure: readonly ControlExposure[];
}

export const GRAPH_CONTROL_SCHEMA = [
  {
    id: "charge",
    group: "simulation",
    type: "number",
    min: -600,
    max: 0,
    step: 5,
    default: -120,
    exposure: ["ui", "lab"],
  },
  {
    id: "linkDistance",
    group: "simulation",
    type: "number",
    min: 5,
    max: 200,
    step: 1,
    default: 40,
    exposure: ["ui", "lab"],
  },
  {
    id: "linkStrength",
    group: "simulation",
    type: "number",
    min: 0,
    max: 3,
    step: 0.05,
    default: 1,
    exposure: ["ui", "lab"],
  },
  {
    id: "chargeDistanceMax",
    group: "simulation",
    type: "number",
    min: 0,
    max: 2000,
    step: 10,
    default: 0,
    exposure: ["lab"],
  },
  {
    id: "chargeTheta",
    group: "simulation",
    type: "number",
    min: 0.1,
    max: 1.5,
    step: 0.05,
    default: 0.5,
    exposure: ["lab"],
  },
  {
    id: "centerStrength",
    group: "simulation",
    type: "number",
    min: 0,
    max: 0.5,
    step: 0.005,
    default: 0.06,
    exposure: ["lab"],
  },
  {
    id: "collidePadding",
    group: "simulation",
    type: "number",
    min: 0,
    max: 20,
    step: 0.5,
    default: 3,
    exposure: ["lab"],
  },
  {
    id: "collideStrength",
    group: "simulation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.35,
    exposure: ["lab"],
  },
  {
    id: "collideIterations",
    group: "simulation",
    type: "number",
    min: 1,
    max: 4,
    step: 1,
    default: 1,
    exposure: ["lab"],
  },
  {
    id: "velocityDecay",
    group: "simulation",
    type: "number",
    min: 0.1,
    max: 0.9,
    step: 0.01,
    default: 0.5,
    exposure: ["lab"],
  },
  {
    id: "alphaDecay",
    group: "simulation",
    type: "number",
    min: 0.005,
    max: 0.2,
    step: 0.001,
    default: 0.03,
    exposure: ["lab"],
  },
  {
    id: "alphaMin",
    group: "simulation",
    type: "number",
    min: 0.0005,
    max: 0.05,
    step: 0.0005,
    default: 0.005,
    exposure: ["lab"],
  },
  {
    id: "dragAlpha",
    group: "simulation",
    type: "number",
    min: 0.05,
    max: 1,
    step: 0.05,
    default: 0.3,
    exposure: ["lab"],
  },
  {
    id: "wakeMove",
    group: "simulation",
    type: "number",
    min: 0,
    max: 50,
    step: 1,
    default: 14,
    exposure: ["lab"],
  },
  {
    id: "wakeRadius",
    group: "simulation",
    type: "number",
    min: 0,
    max: 1000,
    step: 10,
    default: 0,
    exposure: ["lab"],
  },
  {
    id: "sleepSpeed",
    group: "simulation",
    type: "number",
    min: 0.05,
    max: 2,
    step: 0.05,
    default: 0.4,
    exposure: ["lab"],
  },
  {
    id: "sleepTicks",
    group: "simulation",
    type: "number",
    min: 1,
    max: 60,
    step: 1,
    default: 18,
    exposure: ["lab"],
  },
  {
    id: "coldAlpha",
    group: "simulation",
    type: "number",
    min: 0.1,
    max: 1,
    step: 0.05,
    default: 1,
    exposure: [],
  },
  {
    id: "warmReheatAlpha",
    group: "simulation",
    type: "number",
    min: 0.1,
    max: 1,
    step: 0.05,
    default: 0.5,
    exposure: [],
  },
  {
    id: "warmStartAlpha",
    group: "simulation",
    type: "number",
    min: 0.1,
    max: 1,
    step: 0.05,
    default: 0.3,
    exposure: [],
  },
  {
    id: "gentleReheatAlpha",
    group: "simulation",
    type: "number",
    min: 0.02,
    max: 0.5,
    step: 0.01,
    default: 0.15,
    exposure: [],
  },
  {
    id: "prewarmMaxTicks",
    group: "simulation",
    type: "number",
    min: 50,
    max: 1000,
    step: 10,
    default: 300,
    exposure: [],
  },
  {
    id: "prewarmBudgetMs",
    group: "simulation",
    type: "number",
    min: 50,
    max: 1000,
    step: 10,
    default: 260,
    exposure: [],
  },
  {
    id: "annealAlpha",
    group: "simulation",
    type: "number",
    min: 0.05,
    max: 0.6,
    step: 0.05,
    default: 0.3,
    exposure: [],
  },
  {
    id: "annealSettleSpeed",
    group: "simulation",
    type: "number",
    min: 0.01,
    max: 1,
    step: 0.01,
    default: 0.12,
    exposure: [],
  },
  {
    id: "annealSettleTicks",
    group: "simulation",
    type: "number",
    min: 5,
    max: 120,
    step: 5,
    default: 30,
    exposure: [],
  },
  {
    id: "annealMaxTicks",
    group: "simulation",
    type: "number",
    min: 60,
    max: 1800,
    step: 30,
    default: 600,
    exposure: [],
  },
  {
    id: "annealStallTicks",
    group: "simulation",
    type: "number",
    min: 30,
    max: 600,
    step: 10,
    default: 90,
    exposure: [],
  },
  {
    id: "annealStallImprovement",
    group: "simulation",
    type: "number",
    min: 0.005,
    max: 0.2,
    step: 0.005,
    default: 0.02,
    exposure: [],
  },

  {
    id: "nodeSizeScale",
    group: "visualisation",
    type: "number",
    min: 0.25,
    max: 4,
    step: 0.05,
    default: 1,
    exposure: ["ui", "lab"],
  },
  {
    id: "nodeSalienceScale",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 3,
    step: 0.05,
    default: 1,
    exposure: ["ui", "lab"],
  },
  {
    id: "edgeWidthMin",
    group: "visualisation",
    type: "number",
    min: 0.1,
    max: 6,
    step: 0.1,
    default: 0.6,
    exposure: ["lab"],
  },
  {
    id: "edgeWidthMax",
    group: "visualisation",
    type: "number",
    min: 0.1,
    max: 12,
    step: 0.1,
    default: 2.2,
    exposure: ["ui", "lab"],
  },
  {
    id: "edgeOpacityMin",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.02,
    default: 0.1,
    exposure: ["lab"],
  },
  {
    id: "edgeOpacityMax",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.02,
    default: 0.5,
    exposure: ["ui", "lab"],
  },
  {
    id: "edgeColorMode",
    group: "visualisation",
    type: "enum",
    options: ["solid", "gradient"],
    default: "gradient",
    exposure: ["ui", "lab"],
  },
  {
    id: "nodeColorMode",
    group: "visualisation",
    type: "enum",
    options: ["category", "recency"],
    default: "category",
    exposure: ["ui", "lab"],
  },
  {
    id: "nodeIcons",
    group: "visualisation",
    type: "boolean",
    default: false,
    exposure: ["ui", "lab"],
  },

  {
    id: "baseNodeRadius",
    group: "visualisation",
    type: "number",
    min: 2,
    max: 12,
    step: 0.5,
    default: 4,
    exposure: [],
  },
  {
    id: "salienceRadiusMax",
    group: "visualisation",
    type: "number",
    min: 1,
    max: 5,
    step: 0.1,
    default: 2.6,
    exposure: [],
  },
  {
    id: "nodeDegreeReference",
    group: "visualisation",
    type: "number",
    min: 8,
    max: 400,
    step: 1,
    default: 100,
    exposure: [],
  },
  {
    id: "featureLevelScale",
    group: "visualisation",
    type: "number",
    min: 0.1,
    max: 2,
    step: 0.05,
    default: 0.6,
    exposure: [],
  },
  {
    id: "documentLevelScale",
    group: "visualisation",
    type: "number",
    min: 0.5,
    max: 4,
    step: 0.05,
    default: 1.6,
    exposure: [],
  },
  {
    id: "documentLabelSalienceFloor",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.45,
    exposure: [],
  },
  {
    id: "labelBudget",
    group: "visualisation",
    type: "number",
    min: 50,
    max: 1000,
    step: 10,
    default: 220,
    exposure: [],
  },
  {
    id: "nodeMinPx",
    group: "visualisation",
    type: "number",
    min: 0.5,
    max: 8,
    step: 0.5,
    default: 1.5,
    exposure: [],
  },
  {
    id: "nodeMaxPx",
    group: "visualisation",
    type: "number",
    min: 50,
    max: 500,
    step: 10,
    default: 240,
    exposure: [],
  },
  {
    id: "edgeMinPx",
    group: "visualisation",
    type: "number",
    min: 0.5,
    max: 5,
    step: 0.5,
    default: 1,
    exposure: [],
  },
  {
    id: "edgeMaxPx",
    group: "visualisation",
    type: "number",
    min: 8,
    max: 128,
    step: 4,
    default: 64,
    exposure: [],
  },
  {
    id: "pinnedRingWidth",
    group: "visualisation",
    type: "number",
    min: 0.5,
    max: 6,
    step: 0.25,
    default: 1.5,
    exposure: [],
  },
  {
    id: "hoverRingWidth",
    group: "visualisation",
    type: "number",
    min: 0.5,
    max: 6,
    step: 0.25,
    default: 1.75,
    exposure: [],
  },
  {
    id: "pulseRingWidth",
    group: "visualisation",
    type: "number",
    min: 0.5,
    max: 6,
    step: 0.25,
    default: 2.5,
    exposure: [],
  },

  {
    id: "edgeUnknownTierAlphaMult",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.6,
    exposure: [],
  },
  {
    id: "edgeBrokenAlphaMult",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.55,
    exposure: [],
  },
  {
    id: "edgeStaleAlphaMult",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.78,
    exposure: [],
  },
  {
    id: "nodeDimMix",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.02,
    default: 0.72,
    exposure: [],
  },
  {
    id: "nodeDimAlpha",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.4,
    exposure: [],
  },
  {
    id: "edgeDimMix",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.02,
    default: 0.6,
    exposure: [],
  },
  {
    id: "edgeDimAlpha",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.2,
    exposure: [],
  },
  {
    id: "pulseRingAlpha",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.85,
    exposure: [],
  },

  {
    id: "zoomMin",
    group: "navigation",
    type: "number",
    min: 0.001,
    max: 1,
    step: 0.001,
    default: 0.02,
    exposure: [],
  },
  {
    id: "zoomMax",
    group: "navigation",
    type: "number",
    min: 1,
    max: 200,
    step: 1,
    default: 50,
    exposure: [],
  },
  {
    id: "zoomStepButton",
    group: "navigation",
    type: "number",
    min: 1.05,
    max: 2,
    step: 0.05,
    default: 1.2,
    exposure: [],
  },
  {
    id: "zoomStepWheel",
    group: "navigation",
    type: "number",
    min: 1.02,
    max: 1.5,
    step: 0.01,
    default: 1.1,
    exposure: [],
  },
  {
    id: "pinchZoomSensitivity",
    group: "navigation",
    type: "number",
    min: 0.002,
    max: 0.05,
    step: 0.001,
    default: 0.01,
    exposure: [],
  },
  {
    id: "fitPaddingPx",
    group: "navigation",
    type: "number",
    min: 0,
    max: 200,
    step: 4,
    default: 40,
    exposure: [],
  },
  {
    id: "minimapInset",
    group: "navigation",
    type: "number",
    min: 0,
    max: 0.3,
    step: 0.01,
    default: 0.1,
    exposure: [],
  },
  {
    id: "minimapWidth",
    group: "navigation",
    type: "number",
    min: 96,
    max: 512,
    step: 8,
    default: 160,
    exposure: [],
  },
  {
    id: "minimapHeight",
    group: "navigation",
    type: "number",
    min: 64,
    max: 384,
    step: 8,
    default: 100,
    exposure: [],
  },
  {
    id: "dragThresholdPx",
    group: "navigation",
    type: "number",
    min: 1,
    max: 16,
    step: 1,
    default: 2,
    exposure: [],
  },
  {
    id: "pickRadiusPx",
    group: "navigation",
    type: "number",
    min: 4,
    max: 40,
    step: 1,
    default: 14,
    exposure: [],
  },
] as const satisfies readonly ControlSpec[];

export type GraphControlSpec = (typeof GRAPH_CONTROL_SCHEMA)[number];
export type GraphControlId = GraphControlSpec["id"];
type SpecWithExposure<Exposure extends ControlExposure> =
  GraphControlSpec extends infer Spec
    ? Spec extends { exposure: readonly (infer Candidate)[] }
      ? Exposure extends Candidate
        ? Spec
        : never
      : never
    : never;
export type UiGraphControlId = SpecWithExposure<"ui">["id"];
export type LabGraphControlId = SpecWithExposure<"lab">["id"];

const SPEC_BY_ID = new Map<string, ControlSpec>(
  GRAPH_CONTROL_SCHEMA.map((spec) => [spec.id, spec]),
);

export function controlsFor(group: ControlGroup): readonly ControlSpec[] {
  return GRAPH_CONTROL_SCHEMA.filter((spec) => spec.group === group);
}

export function specById(id: string): ControlSpec | undefined {
  return SPEC_BY_ID.get(id);
}

export function defaultsFor(
  group: ControlGroup,
): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const spec of GRAPH_CONTROL_SCHEMA) {
    if (spec.group === group) out[spec.id] = spec.default;
  }
  return out;
}

function numericDefault(id: string): number {
  const spec = SPEC_BY_ID.get(id);
  if (!spec || typeof spec.default !== "number") {
    throw new Error(`graphControlSchema: missing numeric default for "${id}"`);
  }
  return spec.default;
}

function stringDefault(id: string): string {
  const spec = SPEC_BY_ID.get(id);
  if (!spec || typeof spec.default !== "string") {
    throw new Error(`graphControlSchema: missing string default for "${id}"`);
  }
  return spec.default;
}

function booleanDefault(id: string): boolean {
  const spec = SPEC_BY_ID.get(id);
  if (!spec || typeof spec.default !== "boolean") {
    throw new Error(`graphControlSchema: missing boolean default for "${id}"`);
  }
  return spec.default;
}

export const controlNumber = numericDefault;
export const controlString = stringDefault;

export function simulationDefaults(): D3ForceParams {
  return {
    linkDistance: numericDefault("linkDistance"),
    linkStrength: numericDefault("linkStrength"),
    charge: numericDefault("charge"),
    chargeDistanceMax: numericDefault("chargeDistanceMax"),
    chargeTheta: numericDefault("chargeTheta"),
    centerStrength: numericDefault("centerStrength"),
    collidePadding: numericDefault("collidePadding"),
    collideStrength: numericDefault("collideStrength"),
    collideIterations: numericDefault("collideIterations"),
    velocityDecay: numericDefault("velocityDecay"),
    alphaDecay: numericDefault("alphaDecay"),
    alphaMin: numericDefault("alphaMin"),
    dragAlpha: numericDefault("dragAlpha"),
    wakeMove: numericDefault("wakeMove"),
    wakeRadius: numericDefault("wakeRadius"),
    sleepSpeed: numericDefault("sleepSpeed"),
    sleepTicks: numericDefault("sleepTicks"),
  };
}

export function appearanceDefaults(): AppearanceParams {
  return {
    nodeSizeScale: numericDefault("nodeSizeScale"),
    nodeSalienceScale: numericDefault("nodeSalienceScale"),
    edgeWidthMin: numericDefault("edgeWidthMin"),
    edgeWidthMax: numericDefault("edgeWidthMax"),
    edgeOpacityMin: numericDefault("edgeOpacityMin"),
    edgeOpacityMax: numericDefault("edgeOpacityMax"),
    edgeColorMode: stringDefault("edgeColorMode") as EdgeColorMode,
    nodeColorMode: stringDefault("nodeColorMode") as NodeColorMode,
    nodeIcons: booleanDefault("nodeIcons"),
  };
}

export type GraphControlOverrides = Record<string, number | string | boolean>;

export const MAX_GRAPH_CONTROL_OVERRIDES = 256;
const MAX_GRAPH_CONTROL_STRING_LEN = 64;

function isOverrideRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeGraphControlOverrides(
  overrides: unknown,
): GraphControlOverrides {
  if (!isOverrideRecord(overrides)) return {};
  const out: GraphControlOverrides = {};
  let count = 0;
  for (const [id, raw] of Object.entries(overrides)) {
    if (count >= MAX_GRAPH_CONTROL_OVERRIDES) break;
    const spec = SPEC_BY_ID.get(id);
    if (!spec) continue;
    if (spec.type === "number") {
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      const min = spec.min ?? raw;
      const max = spec.max ?? raw;
      out[id] = Math.min(max, Math.max(min, raw));
    } else if (spec.type === "enum") {
      if (
        typeof raw !== "string" ||
        raw.length > MAX_GRAPH_CONTROL_STRING_LEN ||
        !(spec.options ?? []).includes(raw)
      ) {
        continue;
      }
      out[id] = raw;
    } else if (spec.type === "boolean") {
      if (typeof raw !== "boolean") continue;
      out[id] = raw;
    } else {
      continue;
    }
    count += 1;
  }
  return out;
}

export function resolveForceParams(overrides: GraphControlOverrides): D3ForceParams {
  const out = simulationDefaults() as unknown as Record<string, number>;
  for (const [id, value] of Object.entries(overrides)) {
    if (typeof value === "number" && SPEC_BY_ID.get(id)?.group === "simulation") {
      out[id] = value;
    }
  }
  return out as unknown as D3ForceParams;
}

export function resolveAppearanceParams(
  overrides: GraphControlOverrides,
): AppearanceParams {
  const out = appearanceDefaults() as unknown as Record<
    string,
    number | string | boolean
  >;
  for (const [id, value] of Object.entries(overrides)) {
    if (SPEC_BY_ID.get(id)?.group === "visualisation") out[id] = value;
  }
  return out as unknown as AppearanceParams;
}
