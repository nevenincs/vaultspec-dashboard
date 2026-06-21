// The CANONICAL graph control registry — one schema-driven surface for every
// tweakable variable the graph uses for SIMULATION, VISUALISATION, and NAVIGATION.
//
// Goal (graph-control-standardisation): the field, the dev lab, and the app UI all
// read from ONE typed registry instead of scattered hardcoded constants, so nothing
// drifts. This module is the single source of truth for each control's id, label,
// range, default, and where it is surfaced. The scene defaults derive FROM here:
// `d3ForceSolver.D3_FORCE_DEFAULTS = simulationDefaults()` and
// `appearance.APPEARANCE_DEFAULTS = appearanceDefaults()` (so a default change here
// fans out to the solver, the appearance path, and the lab control panels, which
// read the same defaults).
//
// Framework-free, leaf module by design: it imports ONLY types (erased at compile),
// so there is no runtime import cycle with d3ForceSolver / appearance even though
// those modules import its values.
//
// EXPOSURE today:
//   • simulation — all 17 d3-force params are lab knobs (forceControls.ts); the UI
//     graph-controls surfaces only charge/linkDistance/linkStrength.
//   • visualisation — the 7 AppearanceParams are ui+lab (appearanceControls.ts); the
//     remaining viz constants are internal-but-tunable (exposure []) — registry-only
//     here, not yet wired to read from the schema (a sequenced follow-up).
//   • navigation — registry-only (exposure []); the field still reads these as
//     constants today. Listed so the canonical surface is complete and the drift
//     (e.g. the live 0.02–50 zoom clamp vs the stale cameraCore 0.05–8) is named.

import type { D3ForceParams } from "./d3ForceSolver";
import type { AppearanceParams, EdgeColorMode } from "./appearance";

export type ControlGroup = "simulation" | "visualisation" | "navigation";
export type ControlExposure = "ui" | "lab";

export interface ControlSpec {
  /** Canonical param id (matches the field interface key where one exists). */
  id: string;
  /** Display label — the dev-lab / technical vocabulary. */
  label: string;
  /** Friendly user-facing label for ui-exposed entries (the binding plain-language
   *  vocabulary; ui-labels-are-user-facing). apps-review derives the rendered UI label
   *  from this — `label` stays the lab vocabulary. Absent on lab-only/internal entries. */
  uiLabel?: string;
  group: ControlGroup;
  type: "number" | "enum" | "boolean";
  /** number kind. */
  min?: number;
  max?: number;
  step?: number;
  /** enum kind. */
  options?: readonly string[];
  default: number | string | boolean;
  unit?: string;
  /** Where the control is surfaced. `[]` = internal-but-tunable (no UI/lab yet). */
  exposure: readonly ControlExposure[];
  description?: string;
}

export const GRAPH_CONTROL_SCHEMA = [
  // ===================== SIMULATION (d3-force; ranges = forceControls.ts) =====
  {
    id: "charge",
    label: "Repulsion",
    uiLabel: "Spacing",
    group: "simulation",
    type: "number",
    min: -600,
    max: 0,
    step: 5,
    default: -120,
    exposure: ["ui", "lab"],
    description:
      "Many-body repulsion (d3 'charge', SIGNED: negative = repel). The UI 'Repulsion' slider presents the magnitude and sends charge = −repulsion (a presentation remap); the canonical stored value is the signed charge.",
  },
  {
    id: "linkDistance",
    label: "Link distance",
    uiLabel: "Link length",
    group: "simulation",
    type: "number",
    min: 5,
    max: 200,
    step: 1,
    default: 40,
    unit: "world",
    exposure: ["ui", "lab"],
    description: "Spring rest length, centre-to-centre (world units).",
  },
  {
    id: "linkStrength",
    label: "Link strength",
    uiLabel: "Grouping",
    group: "simulation",
    type: "number",
    min: 0,
    max: 3,
    step: 0.05,
    default: 1,
    exposure: ["ui", "lab"],
    description: "Multiplier on the degree-normalized spring strength.",
  },
  {
    id: "chargeDistanceMax",
    label: "Charge max dist",
    group: "simulation",
    type: "number",
    min: 0,
    max: 2000,
    step: 10,
    default: 0,
    unit: "world",
    exposure: ["lab"],
    description: "Bound on repulsion range. 0 = auto (~10× link distance).",
  },
  {
    id: "chargeTheta",
    label: "Barnes–Hut θ",
    group: "simulation",
    type: "number",
    min: 0.1,
    max: 1.5,
    step: 0.05,
    default: 0.8,
    exposure: ["lab"],
    description: "Quadtree accuracy; lower = more accurate, slower.",
  },
  {
    id: "centerStrength",
    label: "Center gravity",
    group: "simulation",
    type: "number",
    min: 0,
    max: 0.5,
    step: 0.005,
    default: 0.06,
    exposure: ["lab"],
    description: "forceX/Y pull toward the origin (compactness + centring).",
  },
  {
    id: "collidePadding",
    label: "Collide padding",
    group: "simulation",
    type: "number",
    min: 0,
    max: 20,
    step: 0.5,
    default: 3,
    unit: "world",
    exposure: ["lab"],
    description: "Extra gap beyond each node radius.",
  },
  {
    id: "collideStrength",
    label: "Collide strength",
    group: "simulation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.8,
    exposure: ["lab"],
    description: "Non-overlap softness (<1 relaxes instead of buzzing).",
  },
  {
    id: "collideIterations",
    label: "Collide iterations",
    group: "simulation",
    type: "number",
    min: 1,
    max: 4,
    step: 1,
    default: 1,
    exposure: ["lab"],
    description: "Relaxation passes per tick.",
  },
  {
    id: "velocityDecay",
    label: "Velocity decay",
    group: "simulation",
    type: "number",
    min: 0.1,
    max: 0.9,
    step: 0.01,
    default: 0.5,
    exposure: ["lab"],
    description: "Friction; velocity ×= (1 − decay) each tick.",
  },
  {
    id: "alphaDecay",
    label: "Alpha decay",
    group: "simulation",
    type: "number",
    min: 0.005,
    max: 0.2,
    step: 0.001,
    default: 0.05,
    exposure: ["lab"],
    description: "Cooling rate; higher = settles in fewer ticks.",
  },
  {
    id: "alphaMin",
    label: "Alpha min",
    group: "simulation",
    type: "number",
    min: 0.0005,
    max: 0.05,
    step: 0.0005,
    default: 0.005,
    exposure: ["lab"],
    description: "Freeze threshold for the global settle.",
  },
  {
    id: "dragAlpha",
    label: "Drag alpha",
    group: "simulation",
    type: "number",
    min: 0.05,
    max: 1,
    step: 0.05,
    default: 0.3,
    exposure: ["lab"],
    description: "Energy held for the woken region while dragging.",
  },
  {
    id: "wakeMove",
    label: "Wake move",
    group: "simulation",
    type: "number",
    min: 0,
    max: 50,
    step: 1,
    default: 14,
    unit: "world",
    exposure: ["lab"],
    description: "How far a node moves before it wakes its sleeping neighbours.",
  },
  {
    id: "wakeRadius",
    label: "Wake radius",
    group: "simulation",
    type: "number",
    min: 0,
    max: 1000,
    step: 10,
    default: 0,
    unit: "world",
    exposure: ["lab"],
    description: "Spatial bound on drag wake. 0 = auto (~7× link distance).",
  },
  {
    id: "sleepSpeed",
    label: "Sleep speed",
    group: "simulation",
    type: "number",
    min: 0.05,
    max: 2,
    step: 0.05,
    default: 0.4,
    exposure: ["lab"],
    description: "Below this speed an awake node counts as quiet.",
  },
  {
    id: "sleepTicks",
    label: "Sleep ticks",
    group: "simulation",
    type: "number",
    min: 1,
    max: 60,
    step: 1,
    default: 18,
    exposure: ["lab"],
    description: "Consecutive quiet ticks before an awake node sleeps.",
  },
  // Settle/init energy schedule — internal (exposure []); solver/field read these as
  // constants today. The TWO warm alphas are DISTINCT concepts, kept apart on purpose.
  {
    id: "coldAlpha",
    label: "Cold-start alpha",
    group: "simulation",
    type: "number",
    min: 0.1,
    max: 1,
    step: 0.05,
    default: 1,
    exposure: [],
    description: "Start alpha for a fresh COLD layout (full re-explode).",
  },
  {
    id: "warmReheatAlpha",
    label: "Warm reheat alpha",
    group: "simulation",
    type: "number",
    min: 0.1,
    max: 1,
    step: 0.05,
    default: 0.5,
    exposure: [],
    description:
      "Reheat/resume energy (solver.reheat) — a gentle re-energise that should not fully explode. DISTINCT from warmStartAlpha.",
  },
  {
    id: "warmStartAlpha",
    label: "Warm-start alpha",
    group: "simulation",
    type: "number",
    min: 0.1,
    max: 1,
    step: 0.05,
    default: 0.3,
    exposure: [],
    description:
      "Warm-START energy (threeField re-set-data that carries most node positions over): LOWER than warmReheatAlpha so carried nodes barely move while new nodes settle (object constancy). Two warm paths → two values, intentional.",
  },
  {
    id: "prewarmMaxTicks",
    label: "Prewarm max ticks",
    group: "simulation",
    type: "number",
    min: 50,
    max: 1000,
    step: 10,
    default: 300,
    exposure: [],
    description: "Cap on off-screen pre-warm iterations (flicker-free init).",
  },
  {
    id: "prewarmBudgetMs",
    label: "Prewarm budget",
    group: "simulation",
    type: "number",
    min: 50,
    max: 1000,
    step: 10,
    default: 260,
    unit: "ms",
    exposure: [],
    description: "Wall-clock budget for the off-screen pre-warm.",
  },

  // ===================== VISUALISATION =======================================
  // The 7 AppearanceParams (ui+lab; ranges = appearanceControls.ts).
  {
    id: "nodeSizeScale",
    label: "Node size",
    uiLabel: "Node size",
    group: "visualisation",
    type: "number",
    min: 0.25,
    max: 4,
    step: 0.05,
    default: 1,
    exposure: ["ui", "lab"],
    description:
      "Global multiplier on every node's drawn radius (also re-spaces collision).",
  },
  {
    id: "nodeSalienceScale",
    label: "Salience spread",
    uiLabel: "Importance",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 3,
    step: 0.05,
    default: 1,
    exposure: ["ui", "lab"],
    description: "How strongly salience inflates a node; 0 = uniform size.",
  },
  {
    id: "edgeWidthMin",
    label: "Edge width min",
    group: "visualisation",
    type: "number",
    min: 0.1,
    max: 6,
    step: 0.1,
    default: 0.6,
    exposure: ["lab"],
    description:
      "Thinnest edge (confidence 0), world-derived px. A FLOOR the UI does not tweak (lab-only); the field still uses this default as the floor.",
  },
  {
    id: "edgeWidthMax",
    label: "Edge width",
    uiLabel: "Link thickness",
    group: "visualisation",
    type: "number",
    min: 0.1,
    max: 12,
    step: 0.1,
    default: 2.2,
    exposure: ["ui", "lab"],
    description: "Thickest edge (confidence 1), world-derived px. The UI headline.",
  },
  {
    id: "edgeOpacityMin",
    label: "Edge opacity min",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.02,
    default: 0.1,
    exposure: ["lab"],
    description:
      "Faintest edge (confidence 0). A FLOOR the UI does not tweak (lab-only); the field still uses this default as the floor.",
  },
  {
    id: "edgeOpacityMax",
    label: "Edge opacity",
    uiLabel: "Link opacity",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.02,
    default: 0.5,
    exposure: ["ui", "lab"],
    description: "Strongest edge (confidence 1).",
  },
  {
    id: "edgeColorMode",
    label: "Edge colour",
    uiLabel: "Link colour",
    group: "visualisation",
    type: "enum",
    options: ["solid", "gradient"],
    default: "gradient",
    exposure: ["ui", "lab"],
    description:
      "Edge inherits the endpoint node hue — solid (source/leaf) or gradient (leaf→parent). Never tier/grey/black.",
  },
  {
    id: "nodeIcons",
    label: "Node icons",
    uiLabel: "Show icons",
    group: "visualisation",
    type: "boolean",
    default: false,
    exposure: ["ui", "lab"],
    description:
      "Draw each node as its doc-type element mark (Decision / Research / Plan / …) instead of a plain category circle. A toggle, not a replacement: circles cross-fade to icons as the node grows on screen, so the field reads as dots when zoomed out and as icons when zoomed in.",
  },

  // Internal-but-tunable viz constants (exposure []): registry-only today — the
  // field still reads these as hardcoded constants; listed so the surface is
  // complete and wiring them to the schema is a mechanical follow-up.
  {
    id: "baseNodeRadius",
    label: "Base node radius",
    group: "visualisation",
    type: "number",
    min: 2,
    max: 12,
    step: 0.5,
    default: 4,
    unit: "world",
    exposure: [],
    description:
      "Base node world radius. Canonical = appearance.BASE_POINT_SIZE (the LIVE three-field path via nodeWorldRadius). The retired nodeAppearance.NODE_RADIUS=6 cosmos/pixi duplicate was removed in Phase B, so this is now the single base radius.",
  },
  {
    id: "salienceRadiusMax",
    label: "Salience radius max",
    group: "visualisation",
    type: "number",
    min: 1,
    max: 5,
    step: 0.1,
    default: 2.6,
    exposure: [],
    description: "Salience 1 inflates a node up to this × the base radius.",
  },
  {
    id: "featureLevelScale",
    label: "Feature-LOD zoom",
    group: "visualisation",
    type: "number",
    min: 0.1,
    max: 2,
    step: 0.05,
    default: 0.6,
    exposure: [],
    description: "Semantic-zoom threshold at which feature-level detail unfolds.",
  },
  {
    id: "documentLevelScale",
    label: "Document-LOD zoom",
    group: "visualisation",
    type: "number",
    min: 0.5,
    max: 4,
    step: 0.05,
    default: 1.6,
    exposure: [],
    description: "Semantic-zoom threshold at which document-level detail unfolds.",
  },
  {
    id: "documentLabelSalienceFloor",
    label: "Doc label salience floor",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.45,
    exposure: [],
    description: "Document labels render only above this salience at document LOD.",
  },
  {
    id: "labelBudget",
    label: "Label budget",
    group: "visualisation",
    type: "number",
    min: 50,
    max: 1000,
    step: 10,
    default: 220,
    exposure: [],
    description: "Maximum labels drawn per frame (clutter cap).",
  },
  {
    id: "nodeMinPx",
    label: "Node min px",
    group: "visualisation",
    type: "number",
    min: 0.5,
    max: 8,
    step: 0.5,
    default: 1.5,
    unit: "px",
    exposure: [],
    description: "Zoom-scaling floor: node radius never below this on screen (GLSL).",
  },
  {
    id: "nodeMaxPx",
    label: "Node max px",
    group: "visualisation",
    type: "number",
    min: 50,
    max: 500,
    step: 10,
    default: 240,
    unit: "px",
    exposure: [],
    description: "Zoom-scaling ceiling: node radius never above this on screen (GLSL).",
  },
  {
    id: "edgeMinPx",
    label: "Edge min px",
    group: "visualisation",
    type: "number",
    min: 0.5,
    max: 5,
    step: 0.5,
    default: 1,
    unit: "px",
    exposure: [],
    description: "Zoom-scaling floor: edge width never below this on screen (GLSL).",
  },
  {
    id: "edgeMaxPx",
    label: "Edge max px",
    group: "visualisation",
    type: "number",
    min: 8,
    max: 128,
    step: 4,
    default: 64,
    unit: "px",
    exposure: [],
    description: "Zoom-scaling ceiling: edge width never above this on screen (GLSL).",
  },
  {
    id: "pinnedRingWidth",
    label: "Pinned ring width",
    group: "visualisation",
    type: "number",
    min: 0.5,
    max: 6,
    step: 0.25,
    default: 1.5,
    exposure: [],
    description:
      "Pinned-node dashed accent ring stroke width (the live threeField value). NB the SELECTED ring is a radius-proportional formula, not a fixed width — this 1.5 is the pinned ring.",
  },
  {
    id: "hoverRingWidth",
    label: "Hover ring width",
    group: "visualisation",
    type: "number",
    min: 0.5,
    max: 6,
    step: 0.25,
    default: 1.75,
    unit: "px",
    exposure: [],
    description: "Hover ring stroke width (UI-scaled px).",
  },
  {
    id: "pulseRingWidth",
    label: "Pulse ring width",
    group: "visualisation",
    type: "number",
    min: 0.5,
    max: 6,
    step: 0.25,
    default: 2.5,
    unit: "px",
    exposure: [],
    description: "Transient pulse ring stroke width (UI-scaled px).",
  },

  // Ultra-fine render treatments — internal (exposure []), registry-only today; the
  // field reads these as hardcoded constants. Listed so the canonical surface is
  // genuinely complete (every tweakable named in one place).
  {
    id: "edgeUnknownTierAlphaMult",
    label: "Edge alpha × (unknown tier)",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.6,
    exposure: [],
    description: "An edge of an unknown tier is dimmed to this × its base alpha.",
  },
  {
    id: "edgeBrokenAlphaMult",
    label: "Edge alpha × (broken)",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.55,
    exposure: [],
    description: "A broken-state edge is dimmed to this × its base alpha.",
  },
  {
    id: "edgeStaleAlphaMult",
    label: "Edge alpha × (stale)",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.78,
    exposure: [],
    description: "A stale-state edge is dimmed to this × its base alpha.",
  },
  {
    id: "nodeDimMix",
    label: "Node dim mix",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.02,
    default: 0.72,
    exposure: [],
    description: "Out-of-emphasis node colour mix toward ink-muted (greyout).",
  },
  {
    id: "nodeDimAlpha",
    label: "Node dim alpha ×",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.4,
    exposure: [],
    description: "Out-of-emphasis node alpha multiplier.",
  },
  {
    id: "edgeDimMix",
    label: "Edge dim mix",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.02,
    default: 0.6,
    exposure: [],
    description: "Out-of-emphasis edge colour mix toward ink-muted (greyout).",
  },
  {
    id: "edgeDimAlpha",
    label: "Edge dim alpha ×",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.2,
    exposure: [],
    description: "Out-of-emphasis edge alpha multiplier.",
  },
  {
    id: "pulseRingAlpha",
    label: "Pulse ring alpha",
    group: "visualisation",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.85,
    exposure: [],
    description: "Transient pulse-ring flash opacity.",
  },

  // ===================== NAVIGATION (registry-only; exposure []) ==============
  {
    id: "zoomMin",
    label: "Zoom min",
    group: "navigation",
    type: "number",
    min: 0.001,
    max: 1,
    step: 0.001,
    default: 0.02,
    exposure: [],
    description:
      "Camera zoom floor — the LIVE three-field clamp (effective range 0.02–50). The cameraCore.MIN_SCALE (0.05) Camera-class clamp it superseded was removed in Phase B.",
  },
  {
    id: "zoomMax",
    label: "Zoom max",
    group: "navigation",
    type: "number",
    min: 1,
    max: 200,
    step: 1,
    default: 50,
    exposure: [],
    description:
      "Camera zoom ceiling — the LIVE three-field clamp. The cameraCore.MAX_SCALE (8) Camera-class clamp it superseded was removed in Phase B.",
  },
  {
    id: "zoomStepButton",
    label: "Zoom step (button)",
    group: "navigation",
    type: "number",
    min: 1.05,
    max: 2,
    step: 0.05,
    default: 1.2,
    exposure: [],
    description: "Multiplicative zoom factor for the zoom-in / zoom-out commands.",
  },
  {
    id: "zoomStepWheel",
    label: "Zoom step (wheel)",
    group: "navigation",
    type: "number",
    min: 1.02,
    max: 1.5,
    step: 0.01,
    default: 1.1,
    exposure: [],
    description: "Multiplicative zoom factor per mouse-wheel notch.",
  },
  {
    id: "fitPaddingFactor",
    label: "Fit padding",
    group: "navigation",
    type: "number",
    min: 1,
    max: 1.5,
    step: 0.02,
    default: 1.2,
    exposure: [],
    description:
      "Cold-fit padding divisor; the graph spans ~1/factor of the viewport (1.2 ≈ 8% per edge).",
  },
  {
    id: "minimapInset",
    label: "Minimap inset",
    group: "navigation",
    type: "number",
    min: 0,
    max: 0.3,
    step: 0.01,
    default: 0.1,
    exposure: [],
    description:
      "Fractional inset of the minimap overview from the minimap canvas edges.",
  },
  {
    id: "minimapWidth",
    label: "Minimap width",
    group: "navigation",
    type: "number",
    min: 96,
    max: 512,
    step: 8,
    default: 160,
    unit: "px",
    exposure: [],
    description:
      "Minimap canvas width (minimapChrome) — binding Figma MinimapWidget 636:2144 (160×100).",
  },
  {
    id: "minimapHeight",
    label: "Minimap height",
    group: "navigation",
    type: "number",
    min: 64,
    max: 384,
    step: 8,
    default: 100,
    unit: "px",
    exposure: [],
    description:
      "Minimap canvas height (minimapChrome) — binding Figma MinimapWidget 636:2144 (160×100).",
  },
  {
    id: "dragThresholdPx",
    label: "Drag threshold",
    group: "navigation",
    type: "number",
    min: 1,
    max: 16,
    step: 1,
    default: 2,
    unit: "px",
    exposure: [],
    description:
      "Pointer motion before a drag/pan engages — the LIVE threeField pan-engage, a manhattan |dx|+|dy| > 2 check. (The schema's old 4 was a stale capture of the retired cameraCore.DRAG_THRESHOLD_PX euclidean value, removed in Phase B; corrected to the live 2.)",
  },
  {
    id: "pickRadiusPx",
    label: "Pick radius",
    group: "navigation",
    type: "number",
    min: 4,
    max: 40,
    step: 1,
    default: 14,
    unit: "px",
    exposure: [],
    description:
      "Pointer hit tolerance for node picking (screen px at the 16px rem basis; UI-scaled at use).",
  },
] as const satisfies readonly ControlSpec[];

const SPEC_BY_ID = new Map<string, ControlSpec>(
  GRAPH_CONTROL_SCHEMA.map((spec) => [spec.id, spec]),
);

/** All specs in a group, in declaration order. */
export function controlsFor(group: ControlGroup): readonly ControlSpec[] {
  return GRAPH_CONTROL_SCHEMA.filter((spec) => spec.group === group);
}

/** Look up one spec by canonical id. */
export function specById(id: string): ControlSpec | undefined {
  return SPEC_BY_ID.get(id);
}

/** A plain id→default map for a group (untyped; for generic consumers). */
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

/** Public canonical-value lookups — the field + cameraCore read their (formerly
 *  hardcoded) constants from here so each tweakable has exactly ONE definition (the
 *  schema), never a schema entry plus a duplicate local const. Fail fast on a bad id. */
export const controlNumber = numericDefault;
export const controlString = stringDefault;

/**
 * The simulation defaults as a fully-typed D3ForceParams, built from the schema —
 * the single source of truth `d3ForceSolver.D3_FORCE_DEFAULTS` derives from. The
 * explicit field list makes the return type enforce that every D3ForceParams key is
 * present, and `numericDefault` fails fast at module load if the schema drops one.
 */
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

/**
 * The appearance defaults as a fully-typed AppearanceParams, built from the schema —
 * the single source of truth `appearance.APPEARANCE_DEFAULTS` derives from.
 */
export function appearanceDefaults(): AppearanceParams {
  return {
    nodeSizeScale: numericDefault("nodeSizeScale"),
    nodeSalienceScale: numericDefault("nodeSalienceScale"),
    edgeWidthMin: numericDefault("edgeWidthMin"),
    edgeWidthMax: numericDefault("edgeWidthMax"),
    edgeOpacityMin: numericDefault("edgeOpacityMin"),
    edgeOpacityMax: numericDefault("edgeOpacityMax"),
    edgeColorMode: stringDefault("edgeColorMode") as EdgeColorMode,
    nodeIcons: booleanDefault("nodeIcons"),
  };
}

// --- graph_controls persisted-override map (graph-control-standardisation) -------
// The `graph_controls` engine SETTING persists a sparse `{control_id: value}` JSON
// object — the user's explicit overrides only; absent ids resolve to the schema
// default. The registry owns the bounded normalize (engine-never-learns-ids, exactly
// as keymap/registry owns normalizeKeybindingOverrides) and the resolve→values.

export type GraphControlOverrides = Record<string, number | string | boolean>;

/** Engine-contract bound on the sparse override map (matches the engine cap;
 *  bounded-by-default-for-every-accumulator). */
export const MAX_GRAPH_CONTROL_OVERRIDES = 256;
const MAX_GRAPH_CONTROL_STRING_LEN = 64;

function isOverrideRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Normalize a raw override map into a bounded, schema-validated sparse map.
 * DEFENSIVE by contract (mirrors normalizeKeybindingOverrides): drops keys that are
 * not canonical schema ids, drops values that do not match the spec (numbers clamped
 * to [min,max]; enum must be a declared option; non-finite / wrong-typed dropped),
 * and caps at MAX_GRAPH_CONTROL_OVERRIDES. A corrupt persisted value can never break
 * the graph — it degrades to the schema defaults. `frozen` and any other non-schema
 * id is dropped: it is never a persisted control.
 */
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

/** Effective FIELD force params: schema simulation defaults overlaid with the
 *  (already-normalized) simulation overrides — exactly the `set-force-params` shape. */
export function resolveForceParams(overrides: GraphControlOverrides): D3ForceParams {
  const out = simulationDefaults() as unknown as Record<string, number>;
  for (const [id, value] of Object.entries(overrides)) {
    if (typeof value === "number" && SPEC_BY_ID.get(id)?.group === "simulation") {
      out[id] = value;
    }
  }
  return out as unknown as D3ForceParams;
}

/** Effective FIELD appearance params: schema appearance defaults overlaid with the
 *  (already-normalized) visualisation overrides — exactly the AppearanceParams shape. */
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
