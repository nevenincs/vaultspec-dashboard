// Minimap widget — the overview-context navigator, docked bottom-right of the
// stage (binding Figma `MinimapWidget` 636:2144 + graph/Hero minimap 212:521).
// Registers a <canvas> with SceneController.setMinimapCanvas() on mount; the scene
// layer (MinimapLayer) renders a downscaled overview into it on each position frame
// and camera change, including the accent viewport rectangle. Chrome provides the
// surface; the scene owns every pixel inside it.
//
// Binding redesign (graph-overlay): the bespoke header (the "Map" eyebrow + the
// recenter and collapse IconButtons) is RETIRED — the binding minimap is a plain
// headerless sunken card holding only the overview. Recenter lives on the camera
// nav cluster (keyboard-reachable there), so the minimap stays purely supplementary
// navigation (minimap ADR: never the sole means of moving the camera).
//
// Layer ownership (dashboard-layer-ownership / minimap ADR "Layer ownership"):
// this is app-chrome hosting a scene-drawn canvas. It owns the card shell, placement,
// and the canvas element; it fetches nothing and reads no raw `tiers` block.
// Navigation intent flows scene-ward — pointer click/drag through the MinimapLayer's
// navigate callback. The viewport rectangle reads in grayscale-safe accent (the only
// stroked outline on the overview), so position is never carried by hue alone.

import { useEffect, useRef } from "react";

import { useMinimapChromeView } from "../../stores/view/minimapChrome";
import { getScene } from "./Stage";

interface MinimapWidgetProps {
  /** When true the widget renders in normal flow (e.g. hosted inside another
   *  surface or a story) rather than docked absolute on the stage. */
  embedded?: boolean;
}

export function MinimapWidget({ embedded = false }: MinimapWidgetProps = {}) {
  const view = useMinimapChromeView(embedded);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Register the canvas with the scene seam once on mount; the scene draws into it
  // every frame. Unregister on unmount so the scene stops spending frames on it.
  useEffect(() => {
    getScene().controller.setMinimapCanvas(canvasRef.current);
    return () => {
      getScene().controller.setMinimapCanvas(null);
    };
  }, []);

  return (
    <div
      className={view.rootClassName}
      style={view.rootStyle}
      role="group"
      aria-label={view.groupAriaLabel}
      data-minimap-widget
    >
      {/* The scene owns every pixel inside this canvas; chrome never calls the
          canvas drawing API. role=img + an accessible name name it as the overview;
          click/drag inside it navigate the camera via the scene's seam. */}
      <canvas
        ref={canvasRef}
        width={view.canvasWidth}
        height={view.canvasHeight}
        role="img"
        aria-label={view.canvasAriaLabel}
        className={view.canvasClassName}
        style={view.canvasStyle}
        data-minimap-canvas
      />
    </div>
  );
}
