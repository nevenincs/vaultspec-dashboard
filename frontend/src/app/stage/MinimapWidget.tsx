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

import { useEffect, useRef } from "react";

import {
  Card,
  ChevronDown,
  ChevronRight,
  Crosshair,
  IconButton,
  SectionLabel,
} from "../kit";
import {
  toggleMinimapCollapsed,
  useMinimapChromeView,
} from "../../stores/view/minimapChrome";
import { getScene } from "./Stage";

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
  const view = useMinimapChromeView(embedded);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Register the canvas with the scene seam. Called once on mount (and again if
  // the user uncollapses after collapsing — the canvas ref is stable across that
  // transition because we keep it in the DOM). While collapsed the canvas is
  // unregistered so the scene stops spending frames on it; the element stays in
  // the DOM (hidden) so its ref survives the round-trip and re-registers cleanly.
  useEffect(() => {
    if (view.collapsed) {
      getScene().controller.setMinimapCanvas(null);
      return;
    }
    getScene().controller.setMinimapCanvas(canvasRef.current);
    return () => {
      getScene().controller.setMinimapCanvas(null);
    };
  }, [view.collapsed]);

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
      className={view.rootClassName}
      style={view.rootStyle}
      role="group"
      aria-label={view.groupAriaLabel}
      data-minimap-widget
    >
      {/* Header strip — a quiet "Map" eyebrow (SectionLabel) plus the recenter +
          collapse controls as kit IconButtons in the Lucide chrome family.
          Attenuated supporting chrome: the field leads. */}
      <div className={view.headerClassName}>
        <SectionLabel>{view.titleLabel}</SectionLabel>
        <div className={view.actionsClassName}>
          {view.showRecenter && (
            <IconButton
              label={view.recenterLabel}
              title={view.recenterLabel}
              onClick={recenter}
              data-minimap-recenter
            >
              <Crosshair size={ICON_PX} aria-hidden />
            </IconButton>
          )}
          <IconButton
            label={view.collapseLabel}
            title={view.collapseLabel}
            active={view.collapseActive}
            aria-expanded={view.collapseAriaExpanded}
            aria-controls={view.canvasRegionId}
            onClick={toggleMinimapCollapsed}
            data-minimap-collapse
          >
            {view.collapseIcon === "expand" ? (
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
        id={view.canvasRegionId}
        aria-hidden={view.canvasRegionAriaHidden}
        style={view.canvasRegionStyle}
      >
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
    </Card>
  );
}
