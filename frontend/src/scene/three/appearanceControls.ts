import { APPEARANCE_DEFAULTS, type AppearanceParams } from "./appearance";
import { controlsFor, type LabGraphControlId } from "./graphControlSchema";

export type AppearanceControlSection = "nodes" | "edges";

interface AppearanceControlBase {
  key: keyof AppearanceParams;
  controlId: LabGraphControlId;
  group: AppearanceControlSection;
}

export interface AppearanceNumberControl extends AppearanceControlBase {
  kind: "number";
  min: number;
  max: number;
  step: number;
}

export interface AppearanceEnumOption {
  value: string;
}

export interface AppearanceEnumControl extends AppearanceControlBase {
  kind: "enum";
  options: AppearanceEnumOption[];
}

export interface AppearanceBooleanControl extends AppearanceControlBase {
  kind: "boolean";
}

export type AppearanceControl =
  | AppearanceNumberControl
  | AppearanceEnumControl
  | AppearanceBooleanControl;

const SUBGROUP = {
  nodeSizeScale: "nodes",
  nodeSalienceScale: "nodes",
  nodeColorMode: "nodes",
  nodeIcons: "nodes",
  edgeColorMode: "edges",
  edgeWidthMin: "edges",
  edgeWidthMax: "edges",
  edgeOpacityMin: "edges",
  edgeOpacityMax: "edges",
} as const satisfies Record<string, AppearanceControlSection>;

export const APPEARANCE_CONTROLS: AppearanceControl[] = controlsFor("visualisation")
  .filter((spec) => spec.id in SUBGROUP)
  .map((spec): AppearanceControl => {
    const base = {
      key: spec.id as keyof AppearanceParams,
      controlId: spec.id as LabGraphControlId,
      group: SUBGROUP[spec.id as keyof typeof SUBGROUP],
    };
    if (spec.type === "enum") {
      return {
        ...base,
        kind: "enum",
        options: (spec.options ?? []).map((value) => ({ value })),
      };
    }
    if (spec.type === "boolean") return { ...base, kind: "boolean" };
    return {
      ...base,
      kind: "number",
      min: spec.min ?? 0,
      max: spec.max ?? 0,
      step: spec.step ?? 0,
    };
  });

export const APPEARANCE_CONTROL_DEFAULTS: AppearanceParams = { ...APPEARANCE_DEFAULTS };

export const APPEARANCE_CONTROL_GROUPS: AppearanceControlSection[] = [
  ...new Set(APPEARANCE_CONTROLS.map((c) => c.group)),
];
