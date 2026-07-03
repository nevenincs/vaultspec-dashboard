// Configurable APPEARANCE parameters — the lab's look-tuning surface, the "look"
// sibling of forceControls. DERIVED from the canonical control registry
// (graphControlSchema): labels, ranges, and defaults all come from there — the single
// source of truth. This adapter re-shapes the registry's ui/lab-exposed
// `visualisation` specs into the discriminated AppearanceControl the panel consumes
// and attaches the panel section grouping (lab presentation only).
//
// Control kinds: a discriminated union so a renderer (the dev lab now, the app
// GraphControls surface later) switches on `kind` — "number" for a slider/stepper,
// "enum" for a select / SegmentedToggle.

import { APPEARANCE_DEFAULTS, type AppearanceParams } from "./appearance";
import { controlsFor } from "./graphControlSchema";

interface AppearanceControlBase {
  key: keyof AppearanceParams;
  label: string;
  group: string;
  /** Short hint for what the knob does. */
  hint: string;
}

/** A numeric knob (slider + stepper). */
export interface AppearanceNumberControl extends AppearanceControlBase {
  kind: "number";
  min: number;
  max: number;
  step: number;
}

export interface AppearanceEnumOption {
  value: string;
  label: string;
}

/** A discrete-choice knob (select / segmented toggle), e.g. the edge colour mode. */
export interface AppearanceEnumControl extends AppearanceControlBase {
  kind: "enum";
  options: AppearanceEnumOption[];
}

export type AppearanceControl = AppearanceNumberControl | AppearanceEnumControl;

/** Panel SECTION per appearance param (lab presentation only). */
const SUBGROUP: Record<string, string> = {
  nodeSizeScale: "Nodes",
  nodeSalienceScale: "Nodes",
  nodeColorMode: "Nodes",
  edgeColorMode: "Edges",
  edgeWidthMin: "Edges",
  edgeWidthMax: "Edges",
  edgeOpacityMin: "Edges",
  edgeOpacityMax: "Edges",
};
const ENUM_OPTION_LABELS: Record<string, string> = {
  solid: "Solid",
  gradient: "Gradient",
  category: "Category",
  recency: "Recency",
};

/** The 7 appearance knobs, derived from the ui/lab-exposed `visualisation` specs (the
 *  registry's exposure-[] viz internals are excluded from the lab knob set). */
export const APPEARANCE_CONTROLS: AppearanceControl[] = controlsFor("visualisation")
  .filter((spec) => spec.id in SUBGROUP)
  .map((spec): AppearanceControl => {
    const base = {
      key: spec.id as keyof AppearanceParams,
      label: spec.label,
      group: SUBGROUP[spec.id],
      hint: spec.description ?? "",
    };
    if (spec.type === "enum") {
      return {
        ...base,
        kind: "enum",
        options: (spec.options ?? []).map((value) => ({
          value,
          label: ENUM_OPTION_LABELS[value] ?? value,
        })),
      };
    }
    return {
      ...base,
      kind: "number",
      min: spec.min ?? 0,
      max: spec.max ?? 0,
      step: spec.step ?? 0,
    };
  });

/** Defaults straight from the field (which derives them from the same registry). */
export const APPEARANCE_CONTROL_DEFAULTS: AppearanceParams = { ...APPEARANCE_DEFAULTS };

/** Group names in first-seen order, for laying the panel out in sections. */
export const APPEARANCE_CONTROL_GROUPS: string[] = [
  ...new Set(APPEARANCE_CONTROLS.map((c) => c.group)),
];
