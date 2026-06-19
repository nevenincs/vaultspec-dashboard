// Configurable simulation parameters, exposed as the lab's live-tuning surface for
// D3ForceSolver. Every D3ForceParams field is here with a sensible range/step; the
// defaults are read straight from D3_FORCE_DEFAULTS so the controls always open at
// the solver's CURRENT values (change a default there and the panel follows). This
// is the "backend" that three.html surfaces as interactive controls.

import { D3_FORCE_DEFAULTS, type D3ForceParams } from "./d3ForceSolver";

export interface ForceControl {
  key: keyof D3ForceParams;
  label: string;
  min: number;
  max: number;
  step: number;
  group: string;
  /** When 0, the solver auto-derives the value from linkDistance — shown as "auto". */
  zeroIsAuto?: boolean;
  /** Short hint for what the knob does. */
  hint: string;
}

export const FORCE_CONTROLS: ForceControl[] = [
  // --- Links -----------------------------------------------------------------
  {
    group: "Links",
    key: "linkDistance",
    label: "Link distance",
    min: 5,
    max: 200,
    step: 1,
    hint: "Spring rest length (world units).",
  },
  {
    group: "Links",
    key: "linkStrength",
    label: "Link strength ×",
    min: 0,
    max: 3,
    step: 0.05,
    hint: "Multiplier on the degree-normalized spring.",
  },
  // --- Charge (repulsion) ----------------------------------------------------
  {
    group: "Charge",
    key: "charge",
    label: "Charge (repel)",
    min: -600,
    max: 0,
    step: 5,
    hint: "Many-body repulsion; more negative = airier.",
  },
  {
    group: "Charge",
    key: "chargeDistanceMax",
    label: "Charge max dist",
    min: 0,
    max: 2000,
    step: 10,
    zeroIsAuto: true,
    hint: "Bound on repulsion range. 0 = auto (~10× link).",
  },
  {
    group: "Charge",
    key: "chargeTheta",
    label: "Barnes–Hut θ",
    min: 0.1,
    max: 1.5,
    step: 0.05,
    hint: "Quadtree accuracy; lower = more accurate, slower.",
  },
  // --- Gravity / centering ---------------------------------------------------
  {
    group: "Gravity",
    key: "centerStrength",
    label: "Center gravity",
    min: 0,
    max: 0.5,
    step: 0.005,
    hint: "forceX/Y pull toward origin (compactness).",
  },
  // --- Collide ---------------------------------------------------------------
  {
    group: "Collide",
    key: "collidePadding",
    label: "Collide padding",
    min: 0,
    max: 20,
    step: 0.5,
    hint: "Extra gap beyond each node radius.",
  },
  {
    group: "Collide",
    key: "collideStrength",
    label: "Collide strength",
    min: 0,
    max: 1,
    step: 0.05,
    hint: "Non-overlap softness (<1 relaxes).",
  },
  {
    group: "Collide",
    key: "collideIterations",
    label: "Collide iterations",
    min: 1,
    max: 4,
    step: 1,
    hint: "Relaxation passes per tick.",
  },
  // --- Cooling / damping -----------------------------------------------------
  {
    group: "Cooling",
    key: "velocityDecay",
    label: "Velocity decay",
    min: 0.1,
    max: 0.9,
    step: 0.01,
    hint: "Friction; velocity ×= (1 − decay) each tick.",
  },
  {
    group: "Cooling",
    key: "alphaDecay",
    label: "Alpha decay",
    min: 0.005,
    max: 0.2,
    step: 0.001,
    hint: "Cooling rate; higher = settles in fewer ticks.",
  },
  {
    group: "Cooling",
    key: "alphaMin",
    label: "Alpha min",
    min: 0.0005,
    max: 0.05,
    step: 0.0005,
    hint: "Freeze threshold for the global settle.",
  },
  // --- Drag & sleep ----------------------------------------------------------
  {
    group: "Drag & sleep",
    key: "dragAlpha",
    label: "Drag alpha",
    min: 0.05,
    max: 1,
    step: 0.05,
    hint: "Energy held for the woken region while dragging.",
  },
  {
    group: "Drag & sleep",
    key: "wakeMove",
    label: "Wake move",
    min: 0,
    max: 50,
    step: 1,
    hint: "How far a node moves before it wakes its neighbours.",
  },
  {
    group: "Drag & sleep",
    key: "wakeRadius",
    label: "Wake radius",
    min: 0,
    max: 1000,
    step: 10,
    zeroIsAuto: true,
    hint: "Spatial bound on drag wake. 0 = auto (~7× link).",
  },
  {
    group: "Drag & sleep",
    key: "sleepSpeed",
    label: "Sleep speed",
    min: 0.05,
    max: 2,
    step: 0.05,
    hint: "Below this an awake node counts as quiet.",
  },
  {
    group: "Drag & sleep",
    key: "sleepTicks",
    label: "Sleep ticks",
    min: 1,
    max: 60,
    step: 1,
    hint: "Quiet ticks before an awake node sleeps.",
  },
];

/** Defaults straight from the solver — the controls open at the current values. */
export const FORCE_CONTROL_DEFAULTS: D3ForceParams = { ...D3_FORCE_DEFAULTS };

/** Group names in first-seen order, for laying the panel out in sections. */
export const FORCE_CONTROL_GROUPS: string[] = [
  ...new Set(FORCE_CONTROLS.map((c) => c.group)),
];
