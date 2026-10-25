import { D3_FORCE_DEFAULTS, type D3ForceParams } from "./d3ForceSolver";
import { controlsFor, type LabGraphControlId } from "./graphControlSchema";

export type ForceControlSection =
  | "links"
  | "charge"
  | "gravity"
  | "collision"
  | "cooling"
  | "dragAndSleep";

export interface ForceControl {
  key: keyof D3ForceParams;
  controlId: LabGraphControlId;
  min: number;
  max: number;
  step: number;
  group: ForceControlSection;
  zeroIsAuto?: boolean;
}

const SUBGROUP = {
  linkDistance: "links",
  linkStrength: "links",
  charge: "charge",
  chargeDistanceMax: "charge",
  chargeTheta: "charge",
  centerStrength: "gravity",
  collidePadding: "collision",
  collideStrength: "collision",
  collideIterations: "collision",
  velocityDecay: "cooling",
  alphaDecay: "cooling",
  alphaMin: "cooling",
  dragAlpha: "dragAndSleep",
  wakeMove: "dragAndSleep",
  wakeRadius: "dragAndSleep",
  sleepSpeed: "dragAndSleep",
  sleepTicks: "dragAndSleep",
} as const satisfies Record<string, ForceControlSection>;
const ZERO_IS_AUTO = new Set<string>(["chargeDistanceMax", "wakeRadius"]);

export const FORCE_CONTROLS: ForceControl[] = controlsFor("simulation")
  .filter((spec) => spec.type === "number" && spec.id in SUBGROUP)
  .map(
    (spec): ForceControl => ({
      key: spec.id as keyof D3ForceParams,
      controlId: spec.id as LabGraphControlId,
      min: spec.min ?? 0,
      max: spec.max ?? 0,
      step: spec.step ?? 0,
      group: SUBGROUP[spec.id as keyof typeof SUBGROUP],
      ...(ZERO_IS_AUTO.has(spec.id) ? { zeroIsAuto: true } : {}),
    }),
  );

export const FORCE_CONTROL_DEFAULTS: D3ForceParams = { ...D3_FORCE_DEFAULTS };

export const FORCE_CONTROL_GROUPS: ForceControlSection[] = [
  ...new Set(FORCE_CONTROLS.map((c) => c.group)),
];
