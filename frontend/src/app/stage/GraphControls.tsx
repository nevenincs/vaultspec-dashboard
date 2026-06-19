// Graph control building blocks for the unified stage top bar
// (graph-timeline-workspace). The floating bottom-left cluster is RETIRED: the
// graph and timeline are one element with one top bar, and these pieces compose
// into it (`StageNavBar`) as horizontal items. Only the minimap remains a canvas
// overlay; the canvas itself reads clean.
//
//   GraphNavButtons — a HORIZONTAL row of kit IconButtons: zoom in (+), zoom out
//              (−), a divider, fit (Maximize), recenter (Crosshair). Camera commands
//              only (SceneController.command). All-icon, no text labels.
//   GraphSettingsPopover — an icon-only gear (kit IconButton) opening the "Graph
//              settings" popover (a kit Card) on demand so the canvas is never
//              occluded; the panel drops DOWN from the top bar. It carries the
//              Freeze-layout toggle. (The Cosmos force sliders + canvas-bound control
//              were removed with the Cosmos field — they get rebuilt three-native
//              against the field's `set-force-params` seam.)
//
// Every control resolves to a real, shared kit definition
// (design-system-is-centralized). The retired chrome (search, filter, the
// layout/representation "mode" switch) is gone for visual clarity — this surface
// carries navigation only.
//
// Layer ownership (dashboard-layer-ownership): app chrome steering the scene.
// Camera + layout affordances emit SceneController.command() ONLY; the panel fetches
// nothing, reads no raw `tiers` block, holds no node shape. Icons are Lucide
// structural marks (the sanctioned chrome family) from the kit. Tokens only — no raw
// hex.

import { useCallback, useEffect, useId } from "react";

import { Pause, Play, SlidersHorizontal } from "lucide-react";

import { Card, Crosshair, IconButton, Maximize, Minus, Plus, Popover } from "../kit";
import {
  useActiveScope,
  useDashboardGraphControlsView,
} from "../../stores/server/queries";
import {
  deriveGraphControlsFreezeToggleView,
  deriveGraphControlsNavigationView,
  deriveGraphControlsSettingsPopoverView,
  setGraphControlsFrozen,
  setGraphControlsSettingsOpen,
  toggleGraphControlsSettingsOpen,
  useGraphControlsFrozen,
  useGraphControlsFrozenScope,
  useGraphControlsSettingsOpen,
} from "../../stores/view/graphControlsChrome";
import { getScene } from "./Stage";

const ICON_PX = 15;

// ---------------------------------------------------------------------------
// Freeze toggle: pauses/resumes the field's simulation without adding new energy.
// Meaningful only in connectivity mode, so it disables itself outside it.
// ---------------------------------------------------------------------------

function FreezeToggle() {
  const scene = getScene();
  const scope = useActiveScope();
  const { freezeAvailable } = useDashboardGraphControlsView(scope);
  const frozen = useGraphControlsFrozen();
  const frozenScope = useGraphControlsFrozenScope();
  const freezeView = deriveGraphControlsFreezeToggleView(frozen, freezeAvailable);

  // A mode/scope switch re-runs the solver, so a stale frozen flag must not persist.
  useEffect(() => {
    if (!frozen) return;
    const scopeChanged = frozenScope !== scope;
    if (freezeAvailable && !scopeChanged) return;
    setGraphControlsFrozen(false, null);
    scene.controller.command({ kind: "set-frozen", frozen: false });
  }, [freezeAvailable, frozen, frozenScope, scene.controller, scope]);

  useEffect(() => {
    return () => {
      if (frozen) scene.controller.command({ kind: "set-frozen", frozen: false });
    };
  }, [frozen, scene.controller]);

  function toggle() {
    const next = !frozen;
    setGraphControlsFrozen(next, scope);
    scene.controller.command({ kind: "set-frozen", frozen: next });
  }

  return (
    <IconButton
      label={freezeView.label}
      title={freezeView.title}
      active={frozen}
      disabled={!freezeAvailable}
      onClick={toggle}
      data-freeze-toggle
    >
      {frozen ? (
        <Play size={ICON_PX} aria-hidden />
      ) : (
        <Pause size={ICON_PX} aria-hidden />
      )}
    </IconButton>
  );
}

// The graph camera cluster, rendered HORIZONTALLY for the unified stage top bar
// (graph-timeline-workspace): zoom in / zoom out · a vertical divider · fit /
// recenter. Camera commands only (SceneController.command). The floating
// bottom-left cluster is retired — all navigation lives in the top bar now, and
// only the minimap remains a canvas overlay.
export function GraphNavButtons() {
  const scene = getScene();
  const navigationView = deriveGraphControlsNavigationView();
  return (
    <div
      className="flex items-center gap-fg-0-5"
      role="group"
      aria-label={navigationView.ariaLabel}
      data-nav-group
    >
      <IconButton
        label={navigationView.zoomIn.label}
        onClick={() => scene.controller.command({ kind: "zoom-in" })}
      >
        <Plus size={ICON_PX} aria-hidden />
      </IconButton>
      <IconButton
        label={navigationView.zoomOut.label}
        onClick={() => scene.controller.command({ kind: "zoom-out" })}
      >
        <Minus size={ICON_PX} aria-hidden />
      </IconButton>
      <span className="mx-fg-0-5 h-4 w-px bg-rule" aria-hidden />
      <IconButton
        label={navigationView.fitToView.label}
        title={navigationView.fitToView.title}
        onClick={() => scene.controller.command({ kind: "fit-to-view" })}
      >
        <Maximize size={ICON_PX} aria-hidden />
      </IconButton>
      <IconButton
        label={navigationView.resetView.label}
        title={navigationView.resetView.title}
        onClick={() => scene.controller.command({ kind: "reset-view" })}
      >
        <Crosshair size={ICON_PX} aria-hidden />
      </IconButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsPopover — a small collapsible group docked to a gear trigger. The body
// pops up away from the bar inside a kit Card so it never occludes the canvas.
// Closes on outside click and Escape. Reduced-motion-safe: no entrance animation.
// ---------------------------------------------------------------------------

interface SettingsPopoverProps {
  label: string;
  icon: React.ReactNode;
  /** data-attribute marker for tests / styling hooks. */
  marker: string;
  children: React.ReactNode;
  /**
   * Where the panel grows relative to the trigger. The default `below` is used by
   * the unified stage top bar (the trigger sits at the TOP edge, so the panel must
   * drop down into the canvas); `above` is the legacy bottom-cluster placement.
   */
  placement?: "above" | "below";
}

function SettingsPopover({
  label,
  icon,
  marker,
  children,
  placement = "below",
}: SettingsPopoverProps) {
  const open = useGraphControlsSettingsOpen();
  const popover = deriveGraphControlsSettingsPopoverView(open, label);
  // The deriver bakes the `above` position into its className; for a top-bar
  // trigger we swap it for a drop-down placement so the panel never clips off the
  // top of the viewport.
  const panelClassName =
    placement === "below"
      ? popover.panelClassName
          .replace("bottom-full", "top-full")
          .replace("mb-fg-2", "mt-fg-2")
      : popover.panelClassName;
  const panelId = useId();
  const close = useCallback(() => setGraphControlsSettingsOpen(false), []);

  return (
    // The shared kit Popover owns the light-dismiss wiring (Escape + outside
    // pointer); the trigger is a child, so no ignoreSelector is needed.
    <Popover
      open={open}
      onDismiss={close}
      escapeTarget={document}
      className="relative flex items-center"
      data-popover-group={marker}
    >
      <span data-popover-trigger>
        {/* All-icon cluster (board 260:893): the settings trigger is an icon-only
            gear, never a text label. */}
        <IconButton
          label={label}
          active={popover.active}
          aria-expanded={popover.ariaExpanded}
          aria-controls={panelId}
          onClick={toggleGraphControlsSettingsOpen}
        >
          {icon}
        </IconButton>
      </span>
      {popover.panelVisible && (
        <Card
          id={panelId}
          elevation="overlay"
          padded={false}
          role="group"
          aria-label={popover.panelAriaLabel}
          className={panelClassName}
          data-popover-panel
        >
          {children}
        </Card>
      )}
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// The graph-settings popover — the gear trigger that holds the Freeze-layout
// toggle, COLLAPSED by default so the field is never occluded. Lives in the
// unified stage top bar alongside the camera cluster (graph-timeline-workspace);
// the panel drops DOWN into the canvas.
// ---------------------------------------------------------------------------

export function GraphSettingsPopover() {
  return (
    <SettingsPopover
      label="Graph settings"
      marker="tune"
      placement="below"
      icon={<SlidersHorizontal size={ICON_PX} aria-hidden />}
    >
      <div className="flex w-48 items-center justify-between gap-fg-2">
        <span className="text-label text-ink-muted">Freeze layout</span>
        <FreezeToggle />
      </div>
    </SettingsPopover>
  );
}
