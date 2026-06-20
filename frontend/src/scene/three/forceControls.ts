// Configurable simulation parameters — the lab's live-tuning surface for D3ForceSolver.
// DERIVED from the canonical control registry (graphControlSchema): the labels,
// ranges, and defaults all come from there — the single source of truth, no second
// copy. This adapter only re-shapes the registry's `simulation` specs into the
// ForceControl the lab panel consumes and attaches the panel SECTION grouping (a
// lab-presentation concern, not a tweakable value).

import { D3_FORCE_DEFAULTS, type D3ForceParams } from "./d3ForceSolver";
import { controlsFor } from "./graphControlSchema";

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

/** Panel SECTION per simulation param (lab presentation only — the registry holds
 *  the canonical control facts; the section a knob renders in is the panel's call). */
const SUBGROUP: Record<string, string> = {
  linkDistance: "Links",
  linkStrength: "Links",
  charge: "Charge",
  chargeDistanceMax: "Charge",
  chargeTheta: "Charge",
  centerStrength: "Gravity",
  collidePadding: "Collide",
  collideStrength: "Collide",
  collideIterations: "Collide",
  velocityDecay: "Cooling",
  alphaDecay: "Cooling",
  alphaMin: "Cooling",
  dragAlpha: "Drag & sleep",
  wakeMove: "Drag & sleep",
  wakeRadius: "Drag & sleep",
  sleepSpeed: "Drag & sleep",
  sleepTicks: "Drag & sleep",
};
const ZERO_IS_AUTO = new Set<string>(["chargeDistanceMax", "wakeRadius"]);

/** The 17 d3-force knobs, derived from the registry's `simulation` specs that map to
 *  a D3ForceParams field. The exposure-[] energy-schedule internals (cold / warm-
 *  reheat / warm-start alphas, prewarm caps) are excluded from the lab knob set. */
export const FORCE_CONTROLS: ForceControl[] = controlsFor("simulation")
  .filter((spec) => spec.type === "number" && spec.id in SUBGROUP)
  .map(
    (spec): ForceControl => ({
      key: spec.id as keyof D3ForceParams,
      label: spec.label,
      min: spec.min ?? 0,
      max: spec.max ?? 0,
      step: spec.step ?? 0,
      group: SUBGROUP[spec.id],
      ...(ZERO_IS_AUTO.has(spec.id) ? { zeroIsAuto: true } : {}),
      hint: spec.description ?? "",
    }),
  );

/** Defaults straight from the solver (which derives them from the same registry). */
export const FORCE_CONTROL_DEFAULTS: D3ForceParams = { ...D3_FORCE_DEFAULTS };

/** Group names in first-seen order, for laying the panel out in sections. */
export const FORCE_CONTROL_GROUPS: string[] = [
  ...new Set(FORCE_CONTROLS.map((c) => c.group)),
];
