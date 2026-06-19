// Configurable APPEARANCE parameters — the "look" sibling of forceControls.ts.
// Where forceControls exposes the simulation BEHAVIOUR (D3ForceParams), this
// exposes the visual LOOK (node module size, edge width/opacity, edge colour mode)
// as the lab's live-tuning surface for ThreeField.setAppearanceParams. The defaults
// read straight from APPEARANCE_DEFAULTS so the controls always open at the field's
// CURRENT values (change a default there and the panel follows).
//
// Control kinds: a discriminated union so a renderer (the dev lab now, the app
// GraphControls surface later) can switch on `kind` — "number" for a slider/stepper,
// "enum" for a select / SegmentedToggle. This is the schema a future GUI controls
// surface binds against, so the same metadata drives the lab and the chrome.

import { APPEARANCE_DEFAULTS, type AppearanceParams } from "./appearance";

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

export const APPEARANCE_CONTROLS: AppearanceControl[] = [
  // --- Nodes -----------------------------------------------------------------
  {
    kind: "number",
    group: "Nodes",
    key: "nodeSizeScale",
    label: "Node size ×",
    min: 0.25,
    max: 4,
    step: 0.05,
    hint: "Global multiplier on every node's drawn radius (also re-spaces collision).",
  },
  {
    kind: "number",
    group: "Nodes",
    key: "nodeSalienceScale",
    label: "Salience spread ×",
    min: 0,
    max: 3,
    step: 0.05,
    hint: "How strongly salience inflates a node; 0 = uniform size.",
  },
  // --- Edges -----------------------------------------------------------------
  {
    kind: "enum",
    group: "Edges",
    key: "edgeColorMode",
    label: "Edge colour",
    hint: "Edges inherit the endpoint node hue — solid (source/leaf) or gradient (leaf→parent). Never tier/grey/black.",
    options: [
      { value: "solid", label: "Solid" },
      { value: "gradient", label: "Gradient" },
    ],
  },
  {
    kind: "number",
    group: "Edges",
    key: "edgeWidthMin",
    label: "Edge width min",
    min: 0.1,
    max: 6,
    step: 0.1,
    hint: "Thinnest edge (low confidence), world-derived px.",
  },
  {
    kind: "number",
    group: "Edges",
    key: "edgeWidthMax",
    label: "Edge width max",
    min: 0.1,
    max: 12,
    step: 0.1,
    hint: "Thickest edge (high confidence), world-derived px.",
  },
  {
    kind: "number",
    group: "Edges",
    key: "edgeOpacityMin",
    label: "Edge opacity min",
    min: 0,
    max: 1,
    step: 0.02,
    hint: "Faintest edge (low confidence).",
  },
  {
    kind: "number",
    group: "Edges",
    key: "edgeOpacityMax",
    label: "Edge opacity max",
    min: 0,
    max: 1,
    step: 0.02,
    hint: "Strongest edge (high confidence).",
  },
];

/** Defaults straight from the field — the controls open at the current values. */
export const APPEARANCE_CONTROL_DEFAULTS: AppearanceParams = { ...APPEARANCE_DEFAULTS };

/** Group names in first-seen order, for laying the panel out in sections. */
export const APPEARANCE_CONTROL_GROUPS: string[] = [
  ...new Set(APPEARANCE_CONTROLS.map((c) => c.group)),
];
