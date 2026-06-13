// Minimap widget (task #6): a scaled-down overview of the graph canvas,
// docked in the bottom-right corner of the stage. Registers a <canvas>
// element with SceneController.setMinimapCanvas() on mount — the scene
// layer renders a downscaled overview into it on each position frame.
//
// The setMinimapCanvas() method is live as of the 2026-06-13 graph-quality
// addenda (P02.S06). Chrome provides the target canvas; the scene owns
// every pixel inside it — chrome never draws into the minimap canvas.
//
// Seam boundary: chrome provides the canvas target via SceneController;
// the scene layer (fe-live-graph / DashboardField) renders into it. Chrome
// never calls the canvas API directly.

import { useEffect, useRef, useState } from "react";

import { getScene } from "./Stage";

const MINIMAP_W = 192;
const MINIMAP_H = 128;

export function MinimapWidget() {
  const [collapsed, setCollapsed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Register the canvas with the scene seam. Called once on mount (and
  // again if the user uncollapses after collapsing — the canvas ref is
  // stable across that transition because we keep it in the DOM).
  useEffect(() => {
    if (collapsed) {
      // Unregister while collapsed so the scene stops rendering frames.
      getScene().controller.setMinimapCanvas(null);
      return;
    }
    getScene().controller.setMinimapCanvas(canvasRef.current);
    return () => {
      getScene().controller.setMinimapCanvas(null);
    };
  }, [collapsed]);

  return (
    <div
      className="pointer-events-auto absolute bottom-2 right-2 z-10 overflow-hidden rounded border border-stone-200 bg-white/90 shadow-sm backdrop-blur-sm"
      style={{ width: collapsed ? "auto" : MINIMAP_W + 2 }}
      data-minimap-widget
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-stone-100 px-2 py-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
          Map
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "expand minimap" : "collapse minimap"}
          className="text-[10px] text-stone-400 hover:text-stone-600"
        >
          {collapsed ? "▸" : "▾"}
        </button>
      </div>

      {/* Canvas — always in the DOM (stable ref); display:none stops painting
          without destroying the canvas, so the ref stays valid on uncollapse */}
      <div
        aria-hidden={collapsed}
        style={{ display: collapsed ? "none" : "block" }}
      >
        <canvas
          ref={canvasRef}
          width={MINIMAP_W}
          height={MINIMAP_H}
          aria-label="graph minimap"
          className="block"
          style={{ width: MINIMAP_W, height: MINIMAP_H }}
        />
      </div>
    </div>
  );
}
