// Minimap widget — the overview-context navigator, docked bottom-right of the
// stage (binding Figma stage chrome: "minimap card bottom-right", AppShell 117:2).
// Registers a <canvas> with SceneController.setMinimapCanvas() on mount; the scene
// layer (MinimapLayer) renders a downscaled overview into it on each position
// frame and camera change. Chrome provides the surface; the scene owns every pixel
// inside it and applies all camera changes — chrome never draws into the canvas and
// never moves the camera itself.
//
// figma-frontend-rewrite W03.P07.S10 / W04.P11.S17: the bespoke bordered-rect shell
// and the hand-built header buttons are RETIRED in favour of the centralized kit —
// the panel is a `Card` (the binding elevation/radius surface), the header eyebrow
// is a `SectionLabel`, and the recenter + collapse affordances are kit `IconButton`
// instances carrying the sanctioned Lucide chrome glyphs (Crosshair, ChevronDown,
// ChevronRight) from `../kit`. A control on screen now resolves to a real, shared
// definition rather than a per-surface hand-built one (design-system-is-centralized).
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
// keyboard pan/zoom lives on the field + nav cluster). Its own affordances are
// keyboard-reachable: the collapse control is a real focusable button whose
// aria-label + aria-expanded reflect state; the canvas carries an accessible
// name as the graph minimap; and a focusable "recenter" button gives a
// non-pointer-only way to refit the field. The viewport rectangle reads in
// grayscale (it is the only stroked outline on the overview), so position is
// never carried by hue alone.

import { useEffect, useRef, useState } from "react";

import {
  Card,
  ChevronDown,
  ChevronRight,
  Crosshair,
  IconButton,
  SectionLabel,
} from "../kit";
import { getScene } from "./Stage";

const MINIMAP_W = 192;
const MINIMAP_H = 128;

// The id the collapse button's aria-controls points at, so assistive tech ties
// the toggle to the canvas region it shows/hides.
const CANVAS_REGION_ID = "minimap-canvas-region";

// Lucide chrome marks render at the widget's small instrument size in single
// currentColor ink drawn from the token layer, so they are theme-correct across
// dark / light / high-contrast for free (iconography ADR).
const ICON_PX = 13;

interface MinimapWidgetProps {
  /** When true the widget renders in normal flow (e.g. hosted inside another
   *  surface or a story) rather than docked absolute on the stage. */
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
  // command — the SAME channel the nav cluster's fit uses — so keyboard
  // navigation from the minimap converges on the scene's camera. The chrome never
  // moves the camera itself; the scene applies the change (instant under reduced
  // motion).
  const recenter = () => getScene().controller.command({ kind: "fit-to-view" });

  return (
    <Card
      elevation={embedded ? "flat" : "raised"}
      padded={false}
      className={
        embedded
          ? "overflow-hidden"
          : "pointer-events-auto absolute bottom-fg-2 right-fg-2 z-10 overflow-hidden backdrop-blur-sm"
      }
      style={{ width: collapsed ? "auto" : MINIMAP_W + 2 }}
      role="group"
      aria-label="graph minimap navigator"
      data-minimap-widget
    >
      {/* Header strip — a quiet "Map" eyebrow (SectionLabel) plus the recenter +
          collapse controls as kit IconButtons in the Lucide chrome family.
          Attenuated supporting chrome: the field leads. */}
      <div className="flex items-center justify-between gap-fg-1 border-b border-rule pr-fg-1">
        <SectionLabel>Map</SectionLabel>
        <div className="flex items-center gap-fg-0-5">
          {!collapsed && (
            <IconButton
              label="recenter the field in view"
              title="recenter the field in view"
              onClick={recenter}
              data-minimap-recenter
            >
              <Crosshair size={ICON_PX} aria-hidden />
            </IconButton>
          )}
          <IconButton
            label={collapsed ? "expand minimap" : "collapse minimap"}
            title={collapsed ? "expand minimap" : "collapse minimap"}
            active={!collapsed}
            aria-expanded={!collapsed}
            aria-controls={CANVAS_REGION_ID}
            onClick={() => setCollapsed((v) => !v)}
            data-minimap-collapse
          >
            {collapsed ? (
              <ChevronRight size={ICON_PX} aria-hidden />
            ) : (
              <ChevronDown size={ICON_PX} aria-hidden />
            )}
          </IconButton>
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
    </Card>
  );
}
