import { describe, expect, it } from "vitest";

import {
  MINIMAP_CANVAS_HEIGHT,
  MINIMAP_CANVAS_WIDTH,
  deriveMinimapChromeView,
  useMinimapChromeView,
} from "./minimapChrome";

describe("minimap chrome view seam (headerless binding card)", () => {
  it("uses the binding 160x100 schema-derived canvas dims", () => {
    expect(MINIMAP_CANVAS_WIDTH).toBe(160);
    expect(MINIMAP_CANVAS_HEIGHT).toBe(100);
  });

  it("projects the docked sunken card for the widget renderer", () => {
    expect(deriveMinimapChromeView(false)).toEqual({
      rootClassName:
        "pointer-events-auto absolute bottom-fg-2 right-fg-2 z-10 overflow-hidden rounded-fg-md bg-paper-sunken",
      rootStyle: { width: 160 },
      groupAriaLabel: "graph minimap navigator",
      canvasWidth: 160,
      canvasHeight: 100,
      canvasAriaLabel:
        "graph minimap - click or drag to move the field; the outlined rectangle marks the current viewport",
      canvasClassName: "block cursor-pointer touch-none",
      canvasStyle: { width: 160, height: 100 },
    });
  });

  it("projects the embedded (in-flow) variant without the absolute dock chrome", () => {
    expect(deriveMinimapChromeView(true)).toMatchObject({
      rootClassName: "overflow-hidden rounded-fg-md bg-paper-sunken",
      rootStyle: { width: 160 },
    });
    // A malformed embedded flag falls back to the docked card (never throws).
    expect(deriveMinimapChromeView("yes")).toMatchObject({
      rootClassName:
        "pointer-events-auto absolute bottom-fg-2 right-fg-2 z-10 overflow-hidden rounded-fg-md bg-paper-sunken",
    });
  });

  it("exposes a named minimap chrome view hook", () => {
    expect(useMinimapChromeView).toBeTypeOf("function");
  });
});
