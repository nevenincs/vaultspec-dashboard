import { create } from "zustand";

// The Cosmos force sliders (Repulsion / Link distance / Link spring) were nuked
// with the Cosmos field; the three-native force controls are rebuilt from scratch
// in W04 against the field's `set-force-params` d3-force seam. The tune-param store
// + presentation helpers were removed with them.

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
  setSettingsOpen: (open: boolean) => void;
  toggleSettingsOpen: () => void;
  setFrozen: (frozen: boolean, scope: string | null) => void;
  reset: () => void;
}

export const useGraphControlsChromeStore = create<GraphControlsChromeState>((set) => ({
  settingsOpen: false,
  frozen: false,
  frozenScope: null,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  toggleSettingsOpen: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
  setFrozen: (frozen, frozenScope) => set({ frozen, frozenScope }),
  reset: () =>
    set({
      settingsOpen: false,
      frozen: false,
      frozenScope: null,
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
