import { useMemo } from "react";
import { create } from "zustand";

export const MINIMAP_CANVAS_WIDTH = 192;
export const MINIMAP_CANVAS_HEIGHT = 128;
export const MINIMAP_CANVAS_REGION_ID = "minimap-canvas-region";

interface MinimapChromeState {
  collapsed: boolean;
  setCollapsed: (collapsed: unknown) => void;
  toggleCollapsed: () => void;
  reset: () => void;
}

export interface MinimapChromeView {
  collapsed: boolean;
  expanded: boolean;
  rootClassName: string;
  rootStyle: { width: number | "auto" };
  groupAriaLabel: string;
  headerClassName: string;
  actionsClassName: string;
  titleLabel: string;
  showRecenter: boolean;
  recenterLabel: string;
  collapseLabel: string;
  collapseActive: boolean;
  collapseAriaExpanded: boolean;
  collapseIcon: "expand" | "collapse";
  canvasRegionId: string;
  canvasRegionAriaHidden: boolean;
  canvasRegionStyle: { display: "none" | "block" };
  canvasWidth: number;
  canvasHeight: number;
  canvasAriaLabel: string;
  canvasClassName: string;
  canvasStyle: { width: number; height: number };
}

export const useMinimapChromeStore = create<MinimapChromeState>((set) => ({
  collapsed: false,
  setCollapsed: (collapsed) => set({ collapsed: normalizeMinimapCollapsed(collapsed) }),
  toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
  reset: () => set({ collapsed: false }),
}));

export function normalizeMinimapCollapsed(value: unknown): boolean {
  return value === true;
}

export function deriveMinimapChromeView(
  collapsed: boolean,
  embedded = false,
): MinimapChromeView {
  const expanded = !collapsed;
  return {
    collapsed,
    expanded,
    rootClassName: embedded
      ? "overflow-hidden"
      : "pointer-events-auto absolute bottom-fg-2 right-fg-2 z-10 overflow-hidden backdrop-blur-sm",
    rootStyle: { width: collapsed ? "auto" : MINIMAP_CANVAS_WIDTH + 2 },
    groupAriaLabel: "graph minimap navigator",
    headerClassName:
      "flex items-center justify-between gap-fg-1 border-b border-rule pr-fg-1",
    actionsClassName: "flex items-center gap-fg-0-5",
    titleLabel: "Map",
    showRecenter: expanded,
    recenterLabel: "recenter the field in view",
    collapseLabel: collapsed ? "expand minimap" : "collapse minimap",
    collapseActive: expanded,
    collapseAriaExpanded: expanded,
    collapseIcon: collapsed ? "expand" : "collapse",
    canvasRegionId: MINIMAP_CANVAS_REGION_ID,
    canvasRegionAriaHidden: collapsed,
    canvasRegionStyle: { display: collapsed ? "none" : "block" },
    canvasWidth: MINIMAP_CANVAS_WIDTH,
    canvasHeight: MINIMAP_CANVAS_HEIGHT,
    canvasAriaLabel:
      "graph minimap - click or drag to move the field; the outlined rectangle marks the current viewport",
    canvasClassName: "block cursor-pointer touch-none",
    canvasStyle: { width: MINIMAP_CANVAS_WIDTH, height: MINIMAP_CANVAS_HEIGHT },
  };
}

export function useMinimapCollapsed(): boolean {
  return useMinimapChromeStore((state) => state.collapsed);
}

export function useMinimapChromeView(embedded = false): MinimapChromeView {
  const collapsed = useMinimapChromeStore((state) => state.collapsed);
  return useMemo(
    () => deriveMinimapChromeView(collapsed, embedded),
    [collapsed, embedded],
  );
}

export function setMinimapCollapsed(collapsed: unknown): void {
  useMinimapChromeStore.getState().setCollapsed(collapsed);
}

export function toggleMinimapCollapsed(): void {
  useMinimapChromeStore.getState().toggleCollapsed();
}

export function resetMinimapChrome(): void {
  useMinimapChromeStore.getState().reset();
}
