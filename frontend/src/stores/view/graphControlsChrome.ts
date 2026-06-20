import { create } from "zustand";

import { appearanceDefaults, specById } from "../../scene/three/graphControlSchema";
import { normalizeViewStoreSessionString } from "./scopeIdentity";

// Three-native force controls, rebuilt against the field's `set-force-params`
// d3-force seam after the Cosmos field was retired. The three knobs are UI-facing
// magnitudes: `repulsion` (the many-body push, mapped to a negative charge on the
// field), `linkDistance` (spring rest length), and `linkSpring` (link-spring
// strength). The GraphControls component maps these onto `set-force-params`.

export interface GraphControlsTuneParams {
  repulsion: number;
  linkDistance: number;
  linkSpring: number;
}

export type GraphControlsTuneParamKey = keyof GraphControlsTuneParams;

export const GRAPH_CONTROLS_TUNE_DEFAULTS: GraphControlsTuneParams = {
  // Derived from the canonical schema. Repulsion is the MAGNITUDE the UI presents;
  // the canonical `charge` default is signed (negative), so repulsion = −charge.
  repulsion: -numericSpec("charge").default,
  linkDistance: numericSpec("linkDistance").default,
  linkSpring: numericSpec("linkStrength").default,
};

function finiteOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// --- schema derivation (graph-control-standardisation) -------------------------
// Every range / label / default below is read from the canonical control registry
// (scene/three/graphControlSchema) instead of being hand-authored here, so the UI
// can never drift from the field. The schema's `exposure: ["ui"]` entries ARE the
// curation of which controls the user surface carries.

/** A numeric ControlSpec narrowed to its required fields; throws at module load if
 *  the schema lacks the id or it is non-numeric (fail-fast on drift). */
function numericSpec(id: string): {
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
} {
  const spec = specById(id);
  if (
    !spec ||
    spec.type !== "number" ||
    spec.min === undefined ||
    spec.max === undefined ||
    spec.step === undefined ||
    typeof spec.default !== "number"
  ) {
    throw new Error(`graphControlsChrome: expected numeric schema spec "${id}"`);
  }
  return {
    label: spec.label,
    min: spec.min,
    max: spec.max,
    step: spec.step,
    default: spec.default,
  };
}

/** Decimal places implied by a slider step, so the readout matches its granularity
 *  (schema-derived precision, not hand-authored). */
function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0 || step >= 1) return 0;
  const text = step.toString();
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : Math.min(4, text.length - dot - 1);
}

export function normalizeGraphControlsTuneParams(
  params: unknown,
): GraphControlsTuneParams {
  const value: Record<string, unknown> =
    params !== null && typeof params === "object"
      ? (params as Record<string, unknown>)
      : {};
  return {
    repulsion: finiteOrDefault(
      "repulsion" in value ? value.repulsion : undefined,
      GRAPH_CONTROLS_TUNE_DEFAULTS.repulsion,
    ),
    linkDistance: finiteOrDefault(
      "linkDistance" in value ? value.linkDistance : undefined,
      GRAPH_CONTROLS_TUNE_DEFAULTS.linkDistance,
    ),
    linkSpring: finiteOrDefault(
      "linkSpring" in value ? value.linkSpring : undefined,
      GRAPH_CONTROLS_TUNE_DEFAULTS.linkSpring,
    ),
  };
}

export function normalizeGraphControlsOpen(open: unknown): boolean {
  return open === true;
}

export function normalizeGraphControlsFrozen(frozen: unknown): boolean {
  return frozen === true;
}

export const normalizeGraphControlsFrozenScope = normalizeViewStoreSessionString;

export interface GraphControlsTuneSliderPresentationView {
  label: string;
  title: string;
  min: number;
  max: number;
  step: number;
}

export interface GraphControlsTunePresentationView {
  /** Panel title (binding Figma `graph/Sim + Display controls` 714:2630). */
  title: string;
  /** The "LAYOUT" category eyebrow (the collapsible group these sliders live in). */
  categoryLabel: string;
  containerClassName: string;
  freezeRowClassName: string;
  freezeLabelClassName: string;
  freezeLabel: string;
  resetButtonClassName: string;
  resetLabel: string;
  sliders: Record<GraphControlsTuneParamKey, GraphControlsTuneSliderPresentationView>;
}

export function deriveGraphControlsTunePresentationView(): GraphControlsTunePresentationView {
  const charge = numericSpec("charge");
  const linkDistance = numericSpec("linkDistance");
  const linkStrength = numericSpec("linkStrength");
  // User-facing labels are the BINDING Figma plain-language vocabulary
  // (ui-labels-are-user-facing): the seam keeps the technical ids (charge /
  // linkDistance / linkStrength) and the screen reads Spacing / Link length /
  // Grouping. The schema's technical labels stay the dev-lab vocabulary.
  return {
    title: "Graph controls",
    categoryLabel: "Layout",
    containerClassName: "flex w-full flex-col gap-fg-2",
    freezeRowClassName: "flex items-center justify-between gap-fg-2",
    freezeLabelClassName: "text-body text-ink-muted",
    freezeLabel: "Freeze layout",
    resetButtonClassName:
      "self-start text-caption text-accent-text underline-offset-2 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    resetLabel: "Reset to defaults",
    sliders: {
      // Spacing presents the repulsion MAGNITUDE: the canonical signed `charge`
      // range (negative) maps to a positive magnitude by negating + swapping
      // min/max. The field still stores the signed charge.
      repulsion: {
        label: "Spacing",
        title: "How far nodes push each other apart",
        min: -charge.max,
        max: -charge.min,
        step: charge.step,
      },
      linkDistance: {
        label: "Link length",
        title: "The rest length of the links between connected nodes",
        min: linkDistance.min,
        max: linkDistance.max,
        step: linkDistance.step,
      },
      linkSpring: {
        label: "Grouping",
        title: "How tightly connected nodes pull together into groups",
        min: linkStrength.min,
        max: linkStrength.max,
        step: linkStrength.step,
      },
    },
  };
}

export function formatGraphControlsTuneValue(
  key: GraphControlsTuneParamKey,
  value: number,
): string {
  const id =
    key === "repulsion"
      ? "charge"
      : key === "linkDistance"
        ? "linkDistance"
        : "linkStrength";
  return value.toFixed(decimalsForStep(numericSpec(id).step));
}

export type GraphControlsBoundShape = "free" | "circle" | "rect";

export interface GraphControlsBoundPresentationView {
  containerClassName: string;
  groupClassName: string;
  labelClassName: string;
  label: string;
  shapeAriaLabel: string;
  freeLabel: string;
  circleLabel: string;
  rectLabel: string;
  showSizeControl: boolean;
  sizeLabel: string;
  sizeTitle: string;
  sizeMin: number;
  sizeMax: number;
  sizeStep: number;
}

export function deriveGraphControlsBoundPresentationView(
  shape: unknown,
): GraphControlsBoundPresentationView {
  const normalizedShape: GraphControlsBoundShape =
    shape === "circle" || shape === "rect" ? shape : "free";
  return {
    containerClassName: "flex w-48 flex-col gap-fg-2",
    groupClassName: "flex flex-col gap-fg-1",
    labelClassName: "text-label text-ink-muted",
    label: "Canvas bound",
    shapeAriaLabel: "Canvas bound shape",
    freeLabel: "Free",
    circleLabel: "Circle",
    rectLabel: "Rect",
    showSizeControl: normalizedShape !== "free",
    sizeLabel: "Bound size",
    sizeTitle:
      normalizedShape === "circle"
        ? "Circle radius in world units; 0 = auto-fit"
        : "Rectangle half-extent in world units; 0 = auto-fit",
    sizeMin: 0,
    sizeMax: 4000,
    sizeStep: 100,
  };
}

export function formatGraphControlsBoundSize(value: unknown): string {
  const normalized = finiteOrDefault(value, 0);
  return normalized <= 0 ? "auto" : String(Math.round(normalized));
}

// --- appearance / "look" controls (graph-backend-unification ADR D3) -----------
// The node-size + edge-look knobs the GraphControls appearance section tunes on the
// active field, mapped onto `set-appearance-params`. The store carries the full
// AppearanceParams shape (so a dispatch is complete); the UI exposes node size,
// salience spread, edge width, edge opacity, and the edge colour-inheritance mode
// (solid | gradient; gradient is the binding default per ADR D2). The edge
// width/opacity MIN ends stay at the field defaults and ride along in the dispatch.

export type GraphControlsEdgeColorMode = "solid" | "gradient";

export interface GraphControlsAppearanceParams {
  nodeSizeScale: number;
  nodeSalienceScale: number;
  edgeWidthMin: number;
  edgeWidthMax: number;
  edgeOpacityMin: number;
  edgeOpacityMax: number;
  edgeColorMode: GraphControlsEdgeColorMode;
}

/** The appearance knobs the UI exposes as sliders (the min ends are not surfaced). */
export type GraphControlsAppearanceSliderKey =
  | "nodeSizeScale"
  | "nodeSalienceScale"
  | "edgeWidthMax"
  | "edgeOpacityMax";

// Derived from the canonical schema (carries the unsurfaced edge-min floors too).
export const GRAPH_CONTROLS_APPEARANCE_DEFAULTS: GraphControlsAppearanceParams =
  appearanceDefaults();

export function normalizeGraphControlsAppearanceParams(
  params: unknown,
): GraphControlsAppearanceParams {
  const value: Record<string, unknown> =
    params !== null && typeof params === "object"
      ? (params as Record<string, unknown>)
      : {};
  const mode = value.edgeColorMode;
  return {
    nodeSizeScale: finiteOrDefault(
      "nodeSizeScale" in value ? value.nodeSizeScale : undefined,
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS.nodeSizeScale,
    ),
    nodeSalienceScale: finiteOrDefault(
      "nodeSalienceScale" in value ? value.nodeSalienceScale : undefined,
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS.nodeSalienceScale,
    ),
    edgeWidthMin: finiteOrDefault(
      "edgeWidthMin" in value ? value.edgeWidthMin : undefined,
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS.edgeWidthMin,
    ),
    edgeWidthMax: finiteOrDefault(
      "edgeWidthMax" in value ? value.edgeWidthMax : undefined,
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS.edgeWidthMax,
    ),
    edgeOpacityMin: finiteOrDefault(
      "edgeOpacityMin" in value ? value.edgeOpacityMin : undefined,
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS.edgeOpacityMin,
    ),
    edgeOpacityMax: finiteOrDefault(
      "edgeOpacityMax" in value ? value.edgeOpacityMax : undefined,
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS.edgeOpacityMax,
    ),
    edgeColorMode:
      mode === "solid" || mode === "gradient"
        ? mode
        : GRAPH_CONTROLS_APPEARANCE_DEFAULTS.edgeColorMode,
  };
}

export interface GraphControlsAppearancePresentationView {
  containerClassName: string;
  headingClassName: string;
  heading: string;
  colorModeLabel: string;
  colorModeAriaLabel: string;
  solidLabel: string;
  gradientLabel: string;
  resetButtonClassName: string;
  resetLabel: string;
  sliders: Record<
    GraphControlsAppearanceSliderKey,
    GraphControlsTuneSliderPresentationView
  >;
}

export function deriveGraphControlsAppearancePresentationView(): GraphControlsAppearancePresentationView {
  const nodeSize = numericSpec("nodeSizeScale");
  const salience = numericSpec("nodeSalienceScale");
  const edgeWidth = numericSpec("edgeWidthMax");
  const edgeOpacity = numericSpec("edgeOpacityMax");
  return {
    // User-facing labels are the BINDING Figma plain-language vocabulary
    // (ui-labels-are-user-facing): Node size / Importance / Link thickness / Link
    // opacity / Link colour [Solid | Blended]. The seam keeps the technical ids.
    containerClassName: "flex w-full flex-col gap-fg-2",
    headingClassName: "text-label text-ink-muted",
    heading: "Appearance",
    colorModeLabel: "Link colour",
    colorModeAriaLabel: "Link colour mode",
    solidLabel: "Solid",
    gradientLabel: "Blended",
    resetButtonClassName:
      "self-start text-caption text-accent-text underline-offset-2 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    resetLabel: "Reset to defaults",
    sliders: {
      nodeSizeScale: {
        label: "Node size",
        title: "Scale every node's drawn size",
        min: nodeSize.min,
        max: nodeSize.max,
        step: nodeSize.step,
      },
      nodeSalienceScale: {
        label: "Importance",
        title: "How strongly a node's importance drives its size (0 = uniform)",
        min: salience.min,
        max: salience.max,
        step: salience.step,
      },
      edgeWidthMax: {
        label: "Link thickness",
        title: "Thickness of the strongest links",
        min: edgeWidth.min,
        max: edgeWidth.max,
        step: edgeWidth.step,
      },
      edgeOpacityMax: {
        label: "Link opacity",
        title: "Opacity of the strongest links",
        min: edgeOpacity.min,
        max: edgeOpacity.max,
        step: edgeOpacity.step,
      },
    },
  };
}

export function formatGraphControlsAppearanceValue(
  key: GraphControlsAppearanceSliderKey,
  value: number,
): string {
  return value.toFixed(decimalsForStep(numericSpec(key).step));
}

export interface GraphControlsSettingsPopoverView {
  active: boolean;
  ariaExpanded: boolean;
  panelVisible: boolean;
  panelAriaLabel: string;
  panelClassName: string;
}

export function deriveGraphControlsSettingsPopoverView(
  open: boolean,
  label: string,
): GraphControlsSettingsPopoverView {
  return {
    active: open,
    ariaExpanded: open,
    panelVisible: open,
    panelAriaLabel: label,
    // The panel drops DOWN-LEFT from the top-right trigger (binding graph/Hero
    // 213:505 `graph-settings-trigger` top-right + `graph/Sim + Display controls`
    // 714:2630 264px card). Right-aligned to the trigger so the 264px body never
    // clips off the right edge of the canvas.
    panelClassName:
      "absolute right-0 top-full z-30 mt-fg-1 flex w-[16.5rem] flex-col gap-fg-3 p-fg-3 backdrop-blur-sm",
  };
}

export interface GraphControlsFreezeToggleView {
  label: string;
  title: string;
}

export function deriveGraphControlsFreezeToggleView(
  frozen: boolean,
  freezeAvailable: boolean,
): GraphControlsFreezeToggleView {
  return {
    label: frozen ? "resume layout" : "freeze layout",
    title: freezeAvailable
      ? frozen
        ? "resume the layout"
        : "freeze the layout in place"
      : "freeze is available in the Network layout",
  };
}

export interface GraphControlsNavigationButtonView {
  label: string;
  title?: string;
}

export interface GraphControlsNavigationView {
  containerClassName: string;
  ariaLabel: string;
  dividerClassName: string;
  zoomIn: GraphControlsNavigationButtonView;
  zoomOut: GraphControlsNavigationButtonView;
  fitToView: GraphControlsNavigationButtonView;
  resetView: GraphControlsNavigationButtonView;
}

export function deriveGraphControlsNavigationView(): GraphControlsNavigationView {
  return {
    // VERTICAL cluster (binding graph/Hero 213:505 NavControls/Vertical 260:839,
    // bottom-left): zoom in / zoom out · a horizontal rule · fit / recenter.
    containerClassName: "flex flex-col items-center gap-fg-0-5",
    ariaLabel: "Navigate",
    dividerClassName: "my-fg-0-5 h-px w-6 bg-rule",
    zoomIn: { label: "zoom in" },
    zoomOut: { label: "zoom out" },
    fitToView: {
      label: "fit to view",
      title: "fit all nodes into the viewport",
    },
    resetView: {
      label: "reset view",
      title: "reset the camera to the origin",
    },
  };
}

interface GraphControlsChromeState {
  settingsOpen: boolean;
  layoutOpen: boolean;
  appearanceOpen: boolean;
  frozen: boolean;
  frozenScope: string | null;
  tuneParams: GraphControlsTuneParams;
  appearanceParams: GraphControlsAppearanceParams;
  setSettingsOpen: (open: unknown) => void;
  toggleSettingsOpen: () => void;
  setLayoutOpen: (open: unknown) => void;
  toggleLayoutOpen: () => void;
  setAppearanceOpen: (open: unknown) => void;
  toggleAppearanceOpen: () => void;
  setFrozen: (frozen: unknown, scope: unknown) => void;
  setTuneParams: (params: unknown) => void;
  patchTuneParams: (patch: unknown) => void;
  setAppearanceParams: (params: unknown) => void;
  patchAppearanceParams: (patch: unknown) => void;
  reset: () => void;
}

export const useGraphControlsChromeStore = create<GraphControlsChromeState>((set) => ({
  settingsOpen: false,
  layoutOpen: true,
  appearanceOpen: true,
  frozen: false,
  frozenScope: null,
  tuneParams: normalizeGraphControlsTuneParams(GRAPH_CONTROLS_TUNE_DEFAULTS),
  appearanceParams: normalizeGraphControlsAppearanceParams(
    GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
  ),
  setSettingsOpen: (settingsOpen) =>
    set({ settingsOpen: normalizeGraphControlsOpen(settingsOpen) }),
  toggleSettingsOpen: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
  setLayoutOpen: (layoutOpen) =>
    set({ layoutOpen: normalizeGraphControlsOpen(layoutOpen) }),
  toggleLayoutOpen: () => set((state) => ({ layoutOpen: !state.layoutOpen })),
  setAppearanceOpen: (appearanceOpen) =>
    set({ appearanceOpen: normalizeGraphControlsOpen(appearanceOpen) }),
  toggleAppearanceOpen: () =>
    set((state) => ({ appearanceOpen: !state.appearanceOpen })),
  setFrozen: (frozen, frozenScope) =>
    set({
      frozen: normalizeGraphControlsFrozen(frozen),
      frozenScope: normalizeGraphControlsFrozenScope(frozenScope),
    }),
  setTuneParams: (tuneParams) =>
    set({ tuneParams: normalizeGraphControlsTuneParams(tuneParams) }),
  patchTuneParams: (patch) =>
    set((state) => {
      const patchRecord: Record<string, unknown> =
        patch !== null && typeof patch === "object"
          ? (patch as Record<string, unknown>)
          : {};
      return {
        tuneParams: normalizeGraphControlsTuneParams({
          ...state.tuneParams,
          ...patchRecord,
        }),
      };
    }),
  setAppearanceParams: (appearanceParams) =>
    set({
      appearanceParams: normalizeGraphControlsAppearanceParams(appearanceParams),
    }),
  patchAppearanceParams: (patch) =>
    set((state) => {
      const patchRecord: Record<string, unknown> =
        patch !== null && typeof patch === "object"
          ? (patch as Record<string, unknown>)
          : {};
      return {
        appearanceParams: normalizeGraphControlsAppearanceParams({
          ...state.appearanceParams,
          ...patchRecord,
        }),
      };
    }),
  reset: () =>
    set({
      settingsOpen: false,
      layoutOpen: true,
      appearanceOpen: true,
      frozen: false,
      frozenScope: null,
      tuneParams: normalizeGraphControlsTuneParams(GRAPH_CONTROLS_TUNE_DEFAULTS),
      appearanceParams: normalizeGraphControlsAppearanceParams(
        GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
      ),
    }),
}));

export function useGraphControlsSettingsOpen(): boolean {
  return useGraphControlsChromeStore((state) => state.settingsOpen);
}

export function useGraphControlsLayoutOpen(): boolean {
  return useGraphControlsChromeStore((state) => state.layoutOpen);
}

export function useGraphControlsAppearanceOpen(): boolean {
  return useGraphControlsChromeStore((state) => state.appearanceOpen);
}

export function useGraphControlsFrozen(): boolean {
  return useGraphControlsChromeStore((state) => state.frozen);
}

export function useGraphControlsFrozenScope(): string | null {
  return useGraphControlsChromeStore((state) => state.frozenScope);
}

export function setGraphControlsSettingsOpen(open: unknown): void {
  useGraphControlsChromeStore.getState().setSettingsOpen(open);
}

export function toggleGraphControlsSettingsOpen(): void {
  useGraphControlsChromeStore.getState().toggleSettingsOpen();
}

export function setGraphControlsLayoutOpen(open: unknown): void {
  useGraphControlsChromeStore.getState().setLayoutOpen(open);
}

export function toggleGraphControlsLayoutOpen(): void {
  useGraphControlsChromeStore.getState().toggleLayoutOpen();
}

export function setGraphControlsAppearanceOpen(open: unknown): void {
  useGraphControlsChromeStore.getState().setAppearanceOpen(open);
}

export function toggleGraphControlsAppearanceOpen(): void {
  useGraphControlsChromeStore.getState().toggleAppearanceOpen();
}

export function setGraphControlsFrozen(frozen: unknown, scope: unknown): void {
  useGraphControlsChromeStore.getState().setFrozen(frozen, scope);
}

export function resetGraphControlsChrome(): void {
  useGraphControlsChromeStore.getState().reset();
}

export function useGraphControlsTuneParams(): GraphControlsTuneParams {
  return useGraphControlsChromeStore((state) => state.tuneParams);
}

export function setGraphControlsTuneParams(params: unknown): void {
  useGraphControlsChromeStore.getState().setTuneParams(params);
}

export function patchGraphControlsTuneParams(patch: unknown): void {
  useGraphControlsChromeStore.getState().patchTuneParams(patch);
}

export function useGraphControlsAppearanceParams(): GraphControlsAppearanceParams {
  return useGraphControlsChromeStore((state) => state.appearanceParams);
}

export function setGraphControlsAppearanceParams(params: unknown): void {
  useGraphControlsChromeStore.getState().setAppearanceParams(params);
}

export function patchGraphControlsAppearanceParams(patch: unknown): void {
  useGraphControlsChromeStore.getState().patchAppearanceParams(patch);
}
