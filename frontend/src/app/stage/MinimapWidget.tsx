// Minimap widget — the overview-context navigator, docked bottom-right of the
// stage. Registers a <canvas> with SceneController.setMinimapCanvas() on mount;
// the scene layer (MinimapLayer) renders a downscaled overview into it on each
// position frame and camera change. Chrome provides the surface; the scene owns
// every pixel inside it and applies all camera changes — chrome never draws into
// the canvas and never moves the camera itself.
//
// Rebuilt figma-parity-reconciliation W02.P05.S34 onto the NEW Figma role-named
// token foundation: attenuated supporting chrome on the semantic token layer with
// a soft low-contrast rule, the three-level raised elevation (`shadow-fg-raised`),
// canonical radius (`rounded-fg-md` panel, `rounded-fg-xs` controls), the
// `caption` type role for the Map label, and the sanctioned Lucide
// structural-chrome marks. The node/feature/viewport colours live entirely in the
// scene layer's token reads, not here.
//
// Layer ownership (dashboard-layer-ownership / minimap ADR "Layer ownership"):
// this is app-chrome hosting a scene-drawn canvas. It owns the panel shell, the
// collapse state, placement, and the canvas element; it fetches nothing and
// reads no raw `tiers` block. Navigation intent flows scene-ward — pointer
// click/drag through the MinimapLayer's navigate callback, and the keyboard
// recenter affordance through the SceneController camera command channel
// (fit-to-view), so keyboard and pointer converge on the scene's camera. The
// camera animation snaps under prefers-reduced-motion at the scene layer, so
// minimap-initiated moves are reduced-motion-correct for free.
//
// Accessibility (minimap ADR "Keyboard and accessibility"): the minimap is
// SUPPLEMENTARY navigation, never the sole means of moving the camera (full
// keyboard pan/zoom lives on the field + NavToolbar). Its own affordances are
// keyboard-reachable: the collapse control is a real focusable button whose
// aria-label + aria-expanded reflect state; the canvas carries an accessible
// name as the graph minimap; and a focusable "recenter" button gives a
// non-pointer-only way to refit the field. The viewport rectangle reads in
// grayscale (it is the only stroked outline on the overview), so position is
// never carried by hue alone.

import { ChevronDown, ChevronRight, Crosshair } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getScene } from "./Stage";

const MINIMAP_W = 192;
const MINIMAP_H = 128;

// The id the collapse button's aria-controls points at, so assistive tech ties
// the toggle to the canvas region it shows/hides.
const CANVAS_REGION_ID = "minimap-canvas-region";

// Lucide chrome marks render at the widget's small instrument size in single
// currentColor ink drawn from the token layer, so they are theme-correct across
// dark / light / high-contrast for free (iconography ADR).
const ICON_PX = 11;

interface MinimapWidgetProps {
  /** When true the widget renders in normal flow (hosted inside the consolidated
   *  GraphControls Overview column) rather than docked absolute on the stage. */
  embedded?: boolean;
}

export function MinimapWidget({ embedded = false }: MinimapWidgetProps = {}) {
  const [collapsed, setCollapsed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Register the canvas with the scene seam. Called once on mount (and again if
  // the user uncollapses after collapsing — the canvas ref is stable across that
  // transition because we keep it in the DOM). While collapsed the canvas is
  // unregistered so the scene stops spending frames on it; the element stays in
  // the DOM (hidden) so its ref survives the round-trip and re-registers cleanly.
  useEffect(() => {
    if (collapsed) {
      getScene().controller.setMinimapCanvas(null);
      return;
    }
    getScene().controller.setMinimapCanvas(canvasRef.current);
    return () => {
      getScene().controller.setMinimapCanvas(null);
    };
  }, [collapsed]);

  // The keyboard recenter affordance issues the canonical fit-to-view camera
  // command — the SAME channel the toolbar's fit uses — so keyboard navigation
  // from the minimap converges on the scene's camera. The chrome never moves the
  // camera itself; the scene applies the change (instant under reduced motion).
  const recenter = () => getScene().controller.command({ kind: "fit-to-view" });

  return (
    <div
      className={
        embedded
          ? "overflow-hidden rounded-fg-md border border-rule bg-paper-raised"
          : "pointer-events-auto absolute bottom-vs-2 right-vs-2 z-10 overflow-hidden rounded-fg-md border border-rule bg-paper-raised/90 shadow-fg-raised backdrop-blur-sm"
      }
      style={{ width: collapsed ? "auto" : MINIMAP_W + 2 }}
      role="group"
      aria-label="graph minimap navigator"
      data-minimap-widget
    >
      {/* Header strip — a quiet "Map" label in the faint ink role at the smallest
          UI step, plus the recenter + collapse controls in the Lucide chrome
          family. Attenuated supporting chrome: the field leads. */}
      <div className="flex items-center justify-between gap-vs-1 border-b border-rule px-vs-2 py-vs-1">
        <span className="text-caption font-medium uppercase tracking-wider text-ink-faint">
          Map
        </span>
        <div className="flex items-center gap-vs-0-5">
          {!collapsed && (
            <button
              type="button"
              onClick={recenter}
              aria-label="recenter the field in view"
              title="recenter the field in view"
              className="flex h-4 w-4 items-center justify-center rounded-fg-xs text-ink-faint transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              data-minimap-recenter
            >
              <Crosshair size={ICON_PX} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "expand minimap" : "collapse minimap"}
            aria-expanded={!collapsed}
            aria-controls={CANVAS_REGION_ID}
            title={collapsed ? "expand minimap" : "collapse minimap"}
            className="flex h-4 w-4 items-center justify-center rounded-fg-xs text-ink-faint transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            data-minimap-collapse
          >
            {collapsed ? (
              <ChevronRight size={ICON_PX} aria-hidden />
            ) : (
              <ChevronDown size={ICON_PX} aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* Canvas — always in the DOM (stable ref); display:none stops painting
          without destroying the canvas, so the ref stays valid on uncollapse.
          The scene owns every pixel inside it; chrome never calls the canvas
          drawing API. role=img + an accessible name name it as the overview;
          click/drag inside it navigate the camera via the scene's seam. */}
      <div
        id={CANVAS_REGION_ID}
        aria-hidden={collapsed}
        style={{ display: collapsed ? "none" : "block" }}
      >
        <canvas
          ref={canvasRef}
          width={MINIMAP_W}
          height={MINIMAP_H}
          role="img"
          aria-label="graph minimap — click or drag to move the field; the outlined rectangle marks the current viewport"
          className="block cursor-pointer touch-none"
          style={{ width: MINIMAP_W, height: MINIMAP_H }}
          data-minimap-canvas
        />
      </div>
    </div>
  );
}
