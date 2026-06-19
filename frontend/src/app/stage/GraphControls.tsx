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
//              Freeze-layout toggle plus the three-native force knobs (Repulsion,
//              Link distance, Link spring) as kit Sliders, wired to the field's
//              `set-force-params` d3-force seam. (The canvas-bound control was retired
//              with the Cosmos field.)
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
  Slider,
} from "../kit";
import {
  useActiveScope,
  useDashboardGraphControlsView,
} from "../../stores/server/queries";
import {
  GRAPH_CONTROLS_TUNE_DEFAULTS,
  deriveGraphControlsFreezeToggleView,
  deriveGraphControlsNavigationView,
  deriveGraphControlsSettingsPopoverView,
  deriveGraphControlsTunePresentationView,
  formatGraphControlsTuneValue,
  setGraphControlsFrozen,
  setGraphControlsSettingsOpen,
  setGraphControlsTuneParams,
  toggleGraphControlsSettingsOpen,
  type GraphControlsTuneParams,
  useGraphControlsFrozen,
  useGraphControlsFrozenScope,
  useGraphControlsSettingsOpen,
  useGraphControlsTuneParams,
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
// LabelledSlider — a kit Slider with a label row and a quiet tabular readout. The
// kit Slider owns the native range input (drag + keyboard arrows, accent track);
// this composes the binding label / readout chrome around it. The optional
// interaction callbacks bracket the drag for the field's interaction coalescing.
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
  onInteractStart?: () => void;
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
  onInteractStart,
  onInteractEnd,
}: LabelledSliderProps) {
  const display = format ? format(value) : String(value);
  return (
    <div className="flex w-full flex-col gap-fg-1" title={title}>
      <span className="flex h-3.5 items-center justify-between">
        <span className="text-label text-ink-muted">{label}</span>
        <span data-tabular className="text-caption tabular-nums text-ink-faint">
          {display}
        </span>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tune group — the field's d3-force knobs (collapsed settings-popover body),
// rebuilt three-native after the Cosmos field was retired. The sliders map onto
// the field's `set-force-params` command (repulsion → −charge, link distance /
// spring straight through).
// ---------------------------------------------------------------------------

/** Trailing-debounce window (ms) for ending a keyboard-driven slider interaction:
 *  a key step has no pointerup, so end-interaction fires once the steps stop. */
const KEYBOARD_SETTLE_MS = 250;

function TuneBody() {
  const params = useGraphControlsTuneParams();
  const tuneView = deriveGraphControlsTunePresentationView();
  const repulsion = tuneView.sliders.repulsion;
  const linkDistance = tuneView.sliders.linkDistance;
  const linkSpring = tuneView.sliders.linkSpring;
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

  const armKeyboardSettle = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(endInteraction, KEYBOARD_SETTLE_MS);
  }, [endInteraction]);

  // End any in-flight interaction if the popover unmounts mid-drag.
  useEffect(() => endInteraction, [endInteraction]);

  function apply(update: Partial<GraphControlsTuneParams>) {
    const next = { ...params, ...update };
    setGraphControlsTuneParams(next);
    // Ensure the held floor is up for the very first change of a drag (covers the
    // case where onChange fires before pointerdown handlers in some browsers).
    beginInteraction();
    // Map the UI knobs onto the field's d3-force params: repulsion is the push
    // MAGNITUDE → a negative charge; link distance / spring map straight through.
    getScene().controller.command({
      kind: "set-force-params",
      params: {
        charge: -next.repulsion,
        linkDistance: next.linkDistance,
        linkStrength: next.linkSpring,
      },
    });
    // Re-arm the keyboard settle each change; a pointerup/blur ends it sooner.
    armKeyboardSettle();
  }

  return (
    <div className={tuneView.containerClassName}>
      <div className={tuneView.freezeRowClassName}>
        <span className={tuneView.freezeLabelClassName}>{tuneView.freezeLabel}</span>
        <FreezeToggle />
      </div>
      <LabelledSlider
        label={repulsion.label}
        title={repulsion.title}
        value={params.repulsion}
        min={repulsion.min}
        max={repulsion.max}
        step={repulsion.step}
        onChange={(v) => apply({ repulsion: v })}
        format={(v) => formatGraphControlsTuneValue("repulsion", v)}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <LabelledSlider
        label={linkDistance.label}
        title={linkDistance.title}
        value={params.linkDistance}
        min={linkDistance.min}
        max={linkDistance.max}
        step={linkDistance.step}
        onChange={(v) => apply({ linkDistance: v })}
        format={(v) => formatGraphControlsTuneValue("linkDistance", v)}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <LabelledSlider
        label={linkSpring.label}
        title={linkSpring.title}
        value={params.linkSpring}
        min={linkSpring.min}
        max={linkSpring.max}
        step={linkSpring.step}
        onChange={(v) => apply({ linkSpring: v })}
        format={(v) => formatGraphControlsTuneValue("linkSpring", v)}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
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
// The graph-settings popover — the gear trigger that holds the Freeze-layout
// toggle and the three-native force knobs, COLLAPSED by default so the field is
// never occluded. Lives in the unified stage top bar alongside the camera cluster
// (graph-timeline-workspace); the panel drops DOWN into the canvas.
// ---------------------------------------------------------------------------

export function GraphSettingsPopover() {
  return (
    <SettingsPopover
      label="Graph settings"
      marker="tune"
      placement="below"
      icon={<SlidersHorizontal size={ICON_PX} aria-hidden />}
    >
      <TuneBody />
    </SettingsPopover>
  );
}
