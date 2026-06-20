import { useMemo } from "react";

import { controlNumber } from "../../scene/three/graphControlSchema";

// Minimap chrome (binding Figma `MinimapWidget` 636:2144 + graph/Hero minimap
// 212:521): the overview navigator is a HEADERLESS sunken card docked bottom-right
// of the canvas — a `surface/sunken` ground on the canonical radius, holding only
// the scene-drawn overview (and the accent viewport rectangle the scene paints).
// The prior "Map" eyebrow + recenter/collapse controls are RETIRED to match the
// binding design: recenter lives on the camera nav cluster, and the minimap is
// always shown (supplementary navigation, never the sole camera control).
//
// Layer ownership (dashboard-layer-ownership / minimap ADR): this is a pure
// presentation projection. The widget owns the card shell + the canvas element and
// registers it with the scene seam; the scene owns every pixel inside it. It
// fetches nothing and reads no raw `tiers`.

// Minimap canvas dims read FROM the canonical control registry so they have ONE
// definition (WIRE-2: the stores→scene/three schema import is the sanctioned
// cross-layer control contract; the schema's home is scene/three).
export const MINIMAP_CANVAS_WIDTH = controlNumber("minimapWidth");
export const MINIMAP_CANVAS_HEIGHT = controlNumber("minimapHeight");

export interface MinimapChromeView {
  rootClassName: string;
  rootStyle: { width: number };
  groupAriaLabel: string;
  canvasWidth: number;
  canvasHeight: number;
  canvasAriaLabel: string;
  canvasClassName: string;
  canvasStyle: { width: number; height: number };
}

export function deriveMinimapChromeView(embedded: unknown = false): MinimapChromeView {
  const embeddedMinimap = embedded === true;
  return {
    // The binding sunken card: paper-sunken ground, canonical radius, clipped so
    // the overview canvas corners round with it. Docked bottom-right unless hosted
    // inside another surface (embedded).
    rootClassName: embeddedMinimap
      ? "overflow-hidden rounded-fg-md bg-paper-sunken"
      : "pointer-events-auto absolute bottom-fg-2 right-fg-2 z-10 overflow-hidden rounded-fg-md bg-paper-sunken",
    rootStyle: { width: MINIMAP_CANVAS_WIDTH },
    groupAriaLabel: "graph minimap navigator",
    canvasWidth: MINIMAP_CANVAS_WIDTH,
    canvasHeight: MINIMAP_CANVAS_HEIGHT,
    canvasAriaLabel:
      "graph minimap - click or drag to move the field; the outlined rectangle marks the current viewport",
    canvasClassName: "block cursor-pointer touch-none",
    canvasStyle: { width: MINIMAP_CANVAS_WIDTH, height: MINIMAP_CANVAS_HEIGHT },
  };
}

export function useMinimapChromeView(embedded: unknown = false): MinimapChromeView {
  return useMemo(() => deriveMinimapChromeView(embedded), [embedded]);
}
