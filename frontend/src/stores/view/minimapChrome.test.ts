import { beforeEach, describe, expect, it } from "vitest";

import {
  deriveMinimapChromeView,
  normalizeMinimapCollapsed,
  resetMinimapChrome,
  setMinimapCollapsed,
  toggleMinimapCollapsed,
  useMinimapChromeView,
  useMinimapChromeStore,
} from "./minimapChrome";

describe("minimap chrome view seam", () => {
  beforeEach(() => resetMinimapChrome());

  it("defaults the minimap to expanded", () => {
    expect(useMinimapChromeStore.getState().collapsed).toBe(false);
  });

  it("sets, toggles, and resets collapse state through the named seam", () => {
    setMinimapCollapsed(true);
    expect(useMinimapChromeStore.getState().collapsed).toBe(true);

    toggleMinimapCollapsed();
    expect(useMinimapChromeStore.getState().collapsed).toBe(false);

    toggleMinimapCollapsed();
    expect(useMinimapChromeStore.getState().collapsed).toBe(true);

    resetMinimapChrome();
    expect(useMinimapChromeStore.getState().collapsed).toBe(false);
  });

  it("normalizes malformed collapse writes at the store boundary", () => {
    expect(normalizeMinimapCollapsed(true)).toBe(true);
    expect(normalizeMinimapCollapsed(false)).toBe(false);
    expect(normalizeMinimapCollapsed("true")).toBe(false);

    setMinimapCollapsed("true");
    expect(useMinimapChromeStore.getState().collapsed).toBe(false);

    setMinimapCollapsed(true);
    expect(useMinimapChromeStore.getState().collapsed).toBe(true);

    setMinimapCollapsed({ collapsed: true });
    expect(useMinimapChromeStore.getState().collapsed).toBe(false);
  });

  it("projects expanded minimap chrome for the widget renderer", () => {
    expect(deriveMinimapChromeView(false)).toMatchObject({
      collapsed: false,
      expanded: true,
      rootClassName:
        "pointer-events-auto absolute bottom-fg-2 right-fg-2 z-10 overflow-hidden backdrop-blur-sm",
      rootStyle: { width: 194 },
      groupAriaLabel: "graph minimap navigator",
      headerClassName:
        "flex items-center justify-between gap-fg-1 border-b border-rule pr-fg-1",
      actionsClassName: "flex items-center gap-fg-0-5",
      titleLabel: "Map",
      showRecenter: true,
      recenterLabel: "recenter the field in view",
      collapseLabel: "collapse minimap",
      collapseActive: true,
      collapseAriaExpanded: true,
      collapseIcon: "collapse",
      canvasRegionId: "minimap-canvas-region",
      canvasRegionAriaHidden: false,
      canvasRegionStyle: { display: "block" },
      canvasWidth: 192,
      canvasHeight: 128,
      canvasClassName: "block cursor-pointer touch-none",
      canvasStyle: { width: 192, height: 128 },
    });
  });

  it("projects collapsed and embedded minimap chrome without local widget branching", () => {
    expect(deriveMinimapChromeView(true, true)).toMatchObject({
      collapsed: true,
      expanded: false,
      rootClassName: "overflow-hidden",
      rootStyle: { width: "auto" },
      showRecenter: false,
      collapseLabel: "expand minimap",
      collapseActive: false,
      collapseAriaExpanded: false,
      collapseIcon: "expand",
      canvasRegionAriaHidden: true,
      canvasRegionStyle: { display: "none" },
    });
  });

  it("exposes a named minimap chrome view hook", () => {
    setMinimapCollapsed(true);
    expect(useMinimapChromeView).toBeTypeOf("function");
    expect(
      deriveMinimapChromeView(useMinimapChromeStore.getState().collapsed),
    ).toMatchObject({
      collapseLabel: "expand minimap",
    });
  });
});
