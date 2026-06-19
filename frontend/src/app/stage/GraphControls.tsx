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
//              occluded; the panel drops DOWN from the top bar. Inside it: the
//              canvas-bound control, the Freeze-layout toggle, and the Cosmos knobs
//              as kit Sliders — Repulsion, Link distance, Link spring — plus Reset.
//
// Every control resolves to a real, shared kit definition
// (design-system-is-centralized). The retired chrome (search, filter, the
// layout/representation "mode" switch) is gone for visual clarity — this surface
// carries navigation only.
//
// Layer ownership (dashboard-layer-ownership): app chrome steering the scene.
// Camera + layout affordances emit SceneController.command() ONLY; granularity is a
// stores write through the canonical dashboard-state mutations that Stage's
// single scene-owner effects turn into scene commands. The panel fetches nothing,
// reads no raw `tiers` block, holds no node shape. Icons are Lucide structural
// marks (the sanctioned chrome family) from the kit. Tokens only — no raw hex.

import { useCallback, useEffect, useId, useRef } from "react";

import { Pause, Play, SlidersHorizontal } from "lucide-react";

import {
  Card,
  Crosshair,
  IconButton,
  Maximize,
  Minus,
  Plus,
  Popover,
  Segment,
  SegmentedToggle,
  Slider,
} from "../kit";
import type { DashboardGraphBounds } from "../../stores/server/engine";
import { useDashboardGraphControlsIntent } from "../../stores/server/dashboardGraphControlsIntent";
import {
  useActiveScope,
  useDashboardGraphControlsView,
} from "../../stores/server/queries";
import {
  GRAPH_CONTROLS_TUNE_DEFAULTS,
  deriveGraphControlsBoundPresentationView,
  deriveGraphControlsFreezeToggleView,
  deriveGraphControlsNavigationView,
  deriveGraphControlsSettingsPopoverView,
  deriveGraphControlsTunePresentationView,
  formatGraphControlsBoundSize,
  formatGraphControlsTuneValue,
  patchGraphControlsTuneParams,
  setGraphControlsFrozen,
  setGraphControlsSettingsOpen,
  setGraphControlsTuneParams,
  type GraphControlsTuneParams,
  useGraphControlsFrozen,
  useGraphControlsFrozenScope,
  toggleGraphControlsSettingsOpen,
  useGraphControlsSettingsOpen,
  useGraphControlsTuneParams,
} from "../../stores/view/graphControlsChrome";
import { getScene } from "./Stage";

const ICON_PX = 15;

// ---------------------------------------------------------------------------
// Freeze toggle: pauses/resumes the Cosmos simulation without adding new energy.
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
// LabelledSlider — a kit Slider with a label row and a quiet tabular readout, used
// for the Tune knobs and the Zoom descent. The kit Slider owns the native range
// input (drag + keyboard arrows, accent track); this composes the binding label /
// readout / end-caption chrome around it. The optional interaction callbacks drive
// the D2 force-coalescing (begin/end-interaction) — the kit Slider has no such
// hooks, so they ride a wrapper whose bubbling pointer/key/blur events bracket the
// drag.
// ---------------------------------------------------------------------------

interface LabelledSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (v: number) => string;
  title?: string;
  /** Optional end captions rendered under the track (Zoom: Overview / Detail). */
  ends?: [string, string];
  /** Fired when a drag/keyboard interaction with the track begins (D2 coalesce). */
  onInteractStart?: () => void;
  /** Fired when the interaction ends (pointerup / blur / keyboard settle, D2). */
  onInteractEnd?: () => void;
}

function LabelledSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  title,
  ends,
  onInteractStart,
  onInteractEnd,
}: LabelledSliderProps) {
  const display = format ? format(value) : String(value);
  return (
    <div className="flex w-full flex-col gap-fg-1" title={title}>
      <span className="flex h-3.5 items-center justify-between">
        <span className="text-label text-ink-muted">{label}</span>
        {!ends && (
          <span data-tabular className="text-caption tabular-nums text-ink-faint">
            {display}
          </span>
        )}
      </span>
      <div
        onPointerDown={onInteractStart}
        onPointerUp={onInteractEnd}
        onKeyDown={onInteractStart}
        onBlur={onInteractEnd}
      >
        <Slider
          label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
        />
      </div>
      {ends && (
        <span className="flex justify-between text-caption text-ink-faint">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsPopover — a small collapsible group docked to a kit DropdownButton
// trigger. The heavy Tune (force) knobs live here so they are COLLAPSED by default
// and never occlude the canvas; the trigger is a labelled DropdownButton, the body
// pops up ABOVE the bar (so it grows away from the field, not over it) inside a kit
// Card. Closes on outside click and Escape. Reduced-motion-safe: no entrance
// animation.
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
// Tune group — Cosmos-native force knobs (collapsed settings-popover body).
// ---------------------------------------------------------------------------

/** Trailing-debounce window (ms) for ending a keyboard-driven slider interaction
 *  (D2): a key step has no pointerup, so end-interaction fires once the steps
 *  stop. Short enough that the field re-cools promptly, long enough to coalesce a
 *  burst of held-arrow steps into one interaction. */
const KEYBOARD_SETTLE_MS = 250;

function TuneBody() {
  const liveState = getScene().controller.getCosmosConfigState();
  const params = useGraphControlsTuneParams();
  const tuneView = deriveGraphControlsTunePresentationView();
  const repulsion = tuneView.sliders.simulationRepulsion;
  const linkDistance = tuneView.sliders.simulationLinkDistance;
  const linkSpring = tuneView.sliders.simulationLinkSpring;
  // Coalesce the interaction: begin once on the first slider change, let Cosmos
  // use its interaction decay while the user is dragging, and end on pointerup,
  // blur, or a trailing debounce for keyboard steps.
  const interactingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginInteraction = useCallback(() => {
    if (interactingRef.current) return;
    interactingRef.current = true;
    getScene().controller.command({ kind: "begin-interaction" });
  }, []);

  const endInteraction = useCallback(() => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (!interactingRef.current) return;
    interactingRef.current = false;
    getScene().controller.command({ kind: "end-interaction" });
  }, []);

  // Trailing debounce: a keyboard step (no pointerup) ends the interaction once
  // the steps stop. Re-armed on every change while a key interaction is live.
  const armKeyboardSettle = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(endInteraction, KEYBOARD_SETTLE_MS);
  }, [endInteraction]);

  useEffect(() => {
    setGraphControlsTuneParams({
      simulationRepulsion: liveState.simulationRepulsion,
      simulationLinkDistance: liveState.simulationLinkDistance,
      simulationLinkSpring: liveState.simulationLinkSpring,
    });
  }, [
    liveState.simulationLinkDistance,
    liveState.simulationLinkSpring,
    liveState.simulationRepulsion,
  ]);

  // Stay in sync with Cosmos config events (another actor may set params).
  useEffect(() => {
    return getScene().controller.on((event) => {
      if (event.kind === "cosmos-config-changed") {
        patchGraphControlsTuneParams({
          simulationRepulsion: event.config.simulationRepulsion,
          simulationLinkDistance: event.config.simulationLinkDistance,
          simulationLinkSpring: event.config.simulationLinkSpring,
        });
      }
    });
  }, []);

  // End any in-flight interaction if the popover unmounts mid-drag.
  useEffect(() => endInteraction, [endInteraction]);

  function apply(update: Partial<GraphControlsTuneParams>) {
    const next = { ...params, ...update };
    setGraphControlsTuneParams(next);
    // Ensure the held floor is up for the very first change of a drag (covers the
    // case where onChange fires before pointerdown handlers in some browsers).
    beginInteraction();
    getScene().controller.command({ kind: "set-cosmos-config", config: update });
    // Re-arm the keyboard settle each change; a pointerup/blur ends it sooner.
    armKeyboardSettle();
  }

  return (
    <div className={tuneView.containerClassName}>
      {/* Freeze the Cosmos simulation — lives in the settings
          popover now that the bottom cluster is NavControls-only. */}
      <div className={tuneView.freezeRowClassName}>
        <span className={tuneView.freezeLabelClassName}>{tuneView.freezeLabel}</span>
        <FreezeToggle />
      </div>
      <LabelledSlider
        label={repulsion.label}
        title={repulsion.title}
        value={params.simulationRepulsion}
        min={repulsion.min}
        max={repulsion.max}
        step={repulsion.step}
        onChange={(v) => apply({ simulationRepulsion: v })}
        format={(v) => formatGraphControlsTuneValue("simulationRepulsion", v)}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <LabelledSlider
        label={linkDistance.label}
        title={linkDistance.title}
        value={params.simulationLinkDistance}
        min={linkDistance.min}
        max={linkDistance.max}
        step={linkDistance.step}
        onChange={(v) => apply({ simulationLinkDistance: v })}
        format={(v) => formatGraphControlsTuneValue("simulationLinkDistance", v)}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <LabelledSlider
        label={linkSpring.label}
        title={linkSpring.title}
        value={params.simulationLinkSpring}
        min={linkSpring.min}
        max={linkSpring.max}
        step={linkSpring.step}
        onChange={(v) => apply({ simulationLinkSpring: v })}
        format={(v) => formatGraphControlsTuneValue("simulationLinkSpring", v)}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      {/* Reset to defaults (board Graph settings 88:2). */}
      <button
        type="button"
        onClick={() => apply(GRAPH_CONTROLS_TUNE_DEFAULTS)}
        className={tuneView.resetButtonClassName}
      >
        {tuneView.resetLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BoundBody — the canvas/sim CONTAINMENT control (node-graph-rework ADR D3): the
// bound shape (Free | Circle | Rect) and its size. The default is free/unbounded.
// A canonical dashboard-state write only; Stage's single scene-owner effect
// projects the accepted graph_bounds back into the field as set-bounds.
// ---------------------------------------------------------------------------

function BoundBody() {
  const scope = useActiveScope();
  const graphControlsIntent = useDashboardGraphControlsIntent(scope);
  const { graphBounds } = useDashboardGraphControlsView(scope);
  const boundView = deriveGraphControlsBoundPresentationView(graphBounds.shape);

  function apply(shape: DashboardGraphBounds["shape"], size: number) {
    void graphControlsIntent.setGraphBounds({ shape, size }).catch(() => undefined);
  }

  return (
    <div className={boundView.containerClassName}>
      <div className={boundView.groupClassName}>
        <span className={boundView.labelClassName}>{boundView.label}</span>
        <SegmentedToggle
          ariaLabel={boundView.shapeAriaLabel}
          value={graphBounds.shape}
          onChange={(v) => apply(v as DashboardGraphBounds["shape"], graphBounds.size)}
          fullWidth
        >
          <Segment value="free">{boundView.freeLabel}</Segment>
          <Segment value="circle">{boundView.circleLabel}</Segment>
          <Segment value="rect">{boundView.rectLabel}</Segment>
        </SegmentedToggle>
      </div>
      {boundView.showSizeControl && (
        <LabelledSlider
          label={boundView.sizeLabel}
          title={boundView.sizeTitle}
          value={graphBounds.size}
          min={boundView.sizeMin}
          max={boundView.sizeMax}
          step={boundView.sizeStep}
          onChange={(v) => apply(graphBounds.shape, v)}
          format={formatGraphControlsBoundSize}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The graph-settings popover — the gear trigger that holds the heavy Tune (force)
// knobs and the canvas-bound control, COLLAPSED by default so the field is never
// occluded. Lives in the unified stage top bar alongside the camera cluster
// (graph-timeline-workspace); the panel drops DOWN into the canvas. The bottom-
// left floating cluster is retired — only the minimap remains a canvas overlay.
// ---------------------------------------------------------------------------

export function GraphSettingsPopover() {
  return (
    <SettingsPopover
      label="Graph settings"
      marker="tune"
      placement="below"
      icon={<SlidersHorizontal size={ICON_PX} aria-hidden />}
    >
      <BoundBody />
      <span className="h-px w-full bg-rule" aria-hidden />
      <TuneBody />
    </SettingsPopover>
  );
}
