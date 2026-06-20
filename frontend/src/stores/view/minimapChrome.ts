import { useMemo } from "react";
import { create } from "zustand";

import { controlNumber } from "../../scene/three/graphControlSchema";

// Minimap canvas dims read FROM the canonical control registry so they have ONE
// definition (value-preserving: 192×128). The stores→scene/three schema import is the
// sanctioned cross-layer control contract (WIRE-2: it does not trip the layer-ownership
// guard; the schema's home is scene/three).
export const MINIMAP_CANVAS_WIDTH = controlNumber("minimapWidth");
export const MINIMAP_CANVAS_HEIGHT = controlNumber("minimapHeight");
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
  toggleCollapsed: () =>
    set((state) => ({ collapsed: !normalizeMinimapCollapsed(state.collapsed) })),
  reset: () => set({ collapsed: false }),
}));

export function normalizeMinimapCollapsed(value: unknown): boolean {
  return value === true;
}

export function deriveMinimapChromeView(
  collapsed: unknown,
  embedded: unknown = false,
): MinimapChromeView {
  const normalizedCollapsed = normalizeMinimapCollapsed(collapsed);
  const embeddedMinimap = embedded === true;
  const expanded = !normalizedCollapsed;
  return {
    collapsed: normalizedCollapsed,
    expanded,
    rootClassName: embeddedMinimap
      ? "overflow-hidden"
      : "pointer-events-auto absolute bottom-fg-2 right-fg-2 z-10 overflow-hidden backdrop-blur-sm",
    rootStyle: { width: normalizedCollapsed ? "auto" : MINIMAP_CANVAS_WIDTH + 2 },
    groupAriaLabel: "graph minimap navigator",
    headerClassName:
      "flex items-center justify-between gap-fg-1 border-b border-rule pr-fg-1",
    actionsClassName: "flex items-center gap-fg-0-5",
    titleLabel: "Map",
    showRecenter: expanded,
    recenterLabel: "recenter the field in view",
    collapseLabel: normalizedCollapsed ? "expand minimap" : "collapse minimap",
    collapseActive: expanded,
    collapseAriaExpanded: expanded,
    collapseIcon: normalizedCollapsed ? "expand" : "collapse",
    canvasRegionId: MINIMAP_CANVAS_REGION_ID,
    canvasRegionAriaHidden: normalizedCollapsed,
    canvasRegionStyle: { display: normalizedCollapsed ? "none" : "block" },
    canvasWidth: MINIMAP_CANVAS_WIDTH,
    canvasHeight: MINIMAP_CANVAS_HEIGHT,
    canvasAriaLabel:
      "graph minimap - click or drag to move the field; the outlined rectangle marks the current viewport",
    canvasClassName: "block cursor-pointer touch-none",
    canvasStyle: { width: MINIMAP_CANVAS_WIDTH, height: MINIMAP_CANVAS_HEIGHT },
  };
}

export function useMinimapCollapsed(): boolean {
  return useMinimapChromeStore((state) => normalizeMinimapCollapsed(state.collapsed));
}

export function useMinimapChromeView(embedded: unknown = false): MinimapChromeView {
  const collapsed = useMinimapChromeStore((state) =>
    normalizeMinimapCollapsed(state.collapsed),
  );
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
