import { create } from "zustand";

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
  params: Partial<GraphControlsTuneParams> | null | undefined,
): GraphControlsTuneParams {
  return {
    repulsion: finiteOrDefault(
      params?.repulsion,
      GRAPH_CONTROLS_TUNE_DEFAULTS.repulsion,
    ),
    linkDistance: finiteOrDefault(
      params?.linkDistance,
      GRAPH_CONTROLS_TUNE_DEFAULTS.linkDistance,
    ),
    linkSpring: finiteOrDefault(
      params?.linkSpring,
      GRAPH_CONTROLS_TUNE_DEFAULTS.linkSpring,
    ),
  };
}

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
  setSettingsOpen: (open: boolean) => void;
  toggleSettingsOpen: () => void;
  setFrozen: (frozen: boolean, scope: string | null) => void;
  setTuneParams: (params: GraphControlsTuneParams) => void;
  patchTuneParams: (patch: Partial<GraphControlsTuneParams>) => void;
  reset: () => void;
}

export const useGraphControlsChromeStore = create<GraphControlsChromeState>((set) => ({
  settingsOpen: false,
  frozen: false,
  frozenScope: null,
  tuneParams: normalizeGraphControlsTuneParams(GRAPH_CONTROLS_TUNE_DEFAULTS),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  toggleSettingsOpen: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
  setFrozen: (frozen, frozenScope) => set({ frozen, frozenScope }),
  setTuneParams: (tuneParams) =>
    set({ tuneParams: normalizeGraphControlsTuneParams(tuneParams) }),
  patchTuneParams: (patch) =>
    set((state) => ({
      tuneParams: normalizeGraphControlsTuneParams({
        ...state.tuneParams,
        ...patch,
      }),
    })),
  reset: () =>
    set({
      settingsOpen: false,
      frozen: false,
      frozenScope: null,
      tuneParams: normalizeGraphControlsTuneParams(GRAPH_CONTROLS_TUNE_DEFAULTS),
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

export function setGraphControlsSettingsOpen(open: boolean): void {
  useGraphControlsChromeStore.getState().setSettingsOpen(open);
}

export function toggleGraphControlsSettingsOpen(): void {
  useGraphControlsChromeStore.getState().toggleSettingsOpen();
}

export function setGraphControlsFrozen(frozen: boolean, scope: string | null): void {
  useGraphControlsChromeStore.getState().setFrozen(frozen, scope);
}

export function resetGraphControlsChrome(): void {
  useGraphControlsChromeStore.getState().reset();
}

export function useGraphControlsTuneParams(): GraphControlsTuneParams {
  return useGraphControlsChromeStore((state) => state.tuneParams);
}

export function setGraphControlsTuneParams(params: GraphControlsTuneParams): void {
  useGraphControlsChromeStore.getState().setTuneParams(params);
}

export function patchGraphControlsTuneParams(
  patch: Partial<GraphControlsTuneParams>,
): void {
  useGraphControlsChromeStore.getState().patchTuneParams(patch);
}
