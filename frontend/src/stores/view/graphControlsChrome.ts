import { create } from "zustand";

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
  // Mirror the field's D3_FORCE_DEFAULTS: charge -120 (repulsion magnitude 120),
  // linkDistance 40, linkStrength 1.
  repulsion: 120,
  linkDistance: 40,
  linkSpring: 1,
};

function finiteOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
  containerClassName: string;
  freezeRowClassName: string;
  freezeLabelClassName: string;
  freezeLabel: string;
  resetButtonClassName: string;
  resetLabel: string;
  sliders: Record<GraphControlsTuneParamKey, GraphControlsTuneSliderPresentationView>;
}

export function deriveGraphControlsTunePresentationView(): GraphControlsTunePresentationView {
  return {
    containerClassName: "flex w-48 flex-col gap-fg-3",
    freezeRowClassName: "flex items-center justify-between",
    freezeLabelClassName: "text-label text-ink-muted",
    freezeLabel: "Freeze simulation",
    resetButtonClassName:
      "self-start text-caption text-accent-text underline-offset-2 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    resetLabel: "Reset to defaults",
    sliders: {
      repulsion: {
        label: "Repulsion",
        title: "How far nodes push each other apart",
        min: 0,
        max: 400,
        step: 10,
      },
      linkDistance: {
        label: "Link distance",
        title: "The rest length of the links between connected nodes",
        min: 5,
        max: 200,
        step: 5,
      },
      linkSpring: {
        label: "Link spring",
        title: "How tightly connected nodes pull together into groups",
        min: 0,
        max: 3,
        step: 0.1,
      },
    },
  };
}

export function formatGraphControlsTuneValue(
  key: GraphControlsTuneParamKey,
  value: number,
): string {
  return key === "linkSpring" ? value.toFixed(1) : String(Math.round(value));
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

export const GRAPH_CONTROLS_APPEARANCE_DEFAULTS: GraphControlsAppearanceParams = {
  // Mirror the field's APPEARANCE_DEFAULTS (gradient edges are the binding default,
  // graph-backend-unification ADR D2).
  nodeSizeScale: 1,
  nodeSalienceScale: 1,
  edgeWidthMin: 0.6,
  edgeWidthMax: 2.2,
  edgeOpacityMin: 0.1,
  edgeOpacityMax: 0.5,
  edgeColorMode: "gradient",
};

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
  return {
    containerClassName: "flex w-48 flex-col gap-fg-3",
    headingClassName: "text-label text-ink-muted",
    heading: "Appearance",
    colorModeLabel: "Edge colour",
    colorModeAriaLabel: "Edge colour mode",
    solidLabel: "Solid",
    gradientLabel: "Gradient",
    resetButtonClassName:
      "self-start text-caption text-accent-text underline-offset-2 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    resetLabel: "Reset to defaults",
    sliders: {
      nodeSizeScale: {
        label: "Node size",
        title: "Scale every node's drawn size",
        min: 0.5,
        max: 2.5,
        step: 0.1,
      },
      nodeSalienceScale: {
        label: "Salience spread",
        title: "How strongly salience drives node size (0 = uniform)",
        min: 0,
        max: 1,
        step: 0.1,
      },
      edgeWidthMax: {
        label: "Edge width",
        title: "Thickness of the strongest edges",
        min: 0.5,
        max: 6,
        step: 0.2,
      },
      edgeOpacityMax: {
        label: "Edge opacity",
        title: "Opacity of the strongest edges",
        min: 0.1,
        max: 1,
        step: 0.05,
      },
    },
  };
}

export function formatGraphControlsAppearanceValue(
  key: GraphControlsAppearanceSliderKey,
  value: number,
): string {
  return key === "edgeOpacityMax" ? value.toFixed(2) : value.toFixed(1);
}

export type GraphControlsBoundShape = "free" | "circle" | "rect";

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
    panelClassName:
      "absolute bottom-full right-0 z-30 mb-fg-2 flex flex-col gap-fg-2 bg-paper-raised/95 p-fg-3 backdrop-blur-sm",
  };
}

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
  shape: GraphControlsBoundShape,
): GraphControlsBoundPresentationView {
  return {
    containerClassName: "flex w-48 flex-col gap-fg-2",
    groupClassName: "flex flex-col gap-fg-1",
    labelClassName: "text-label text-ink-muted",
    label: "Canvas bound",
    shapeAriaLabel: "Canvas bound shape",
    freeLabel: "Free",
    circleLabel: "Circle",
    rectLabel: "Rect",
    showSizeControl: shape !== "free",
    sizeLabel: "Bound size",
    sizeTitle:
      shape === "circle"
        ? "Circle radius in world units; 0 = auto-fit"
        : "Rectangle half-extent in world units; 0 = auto-fit",
    sizeMin: 0,
    sizeMax: 4000,
    sizeStep: 100,
  };
}

export function formatGraphControlsBoundSize(value: number): string {
  return value === 0 ? "auto" : String(Math.round(value));
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
    label: frozen ? "resume simulation" : "freeze simulation",
    title: freezeAvailable
      ? frozen
        ? "resume the simulation"
        : "pause the simulation in place"
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
    containerClassName: "flex items-center gap-fg-0-5",
    ariaLabel: "Navigate",
    dividerClassName: "mx-fg-0-5 h-4 w-px bg-rule",
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
  frozen: boolean;
  frozenScope: string | null;
  tuneParams: GraphControlsTuneParams;
  appearanceParams: GraphControlsAppearanceParams;
  setSettingsOpen: (open: unknown) => void;
  toggleSettingsOpen: () => void;
  setFrozen: (frozen: unknown, scope: unknown) => void;
  setTuneParams: (params: unknown) => void;
  patchTuneParams: (patch: unknown) => void;
  setAppearanceParams: (params: unknown) => void;
  patchAppearanceParams: (patch: unknown) => void;
  reset: () => void;
}

export const useGraphControlsChromeStore = create<GraphControlsChromeState>((set) => ({
  settingsOpen: false,
  frozen: false,
  frozenScope: null,
  tuneParams: normalizeGraphControlsTuneParams(GRAPH_CONTROLS_TUNE_DEFAULTS),
  appearanceParams: normalizeGraphControlsAppearanceParams(
    GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
  ),
  setSettingsOpen: (settingsOpen) =>
    set({ settingsOpen: normalizeGraphControlsOpen(settingsOpen) }),
  toggleSettingsOpen: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
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
