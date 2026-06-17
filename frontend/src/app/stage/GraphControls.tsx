// Consolidated graph controls (binding Figma stage chrome: the zoom cluster +
// settings popover, `graph/Settings popover` 88:2, `graph/Hero` 213:505,
// NavControls 260:893). A COMPACT, NON-OCCLUDING edge overlay: the Hero binding
// shows the category-circle canvas CLEAN with the controls as an unobtrusive
// bottom-edge toolbar — never a panel that covers the field. So this surface is a
// single slim toolbar docked to the bottom edge: the light, always-reachable
// groups (Navigate, Layout, Zoom) sit inline, and the heavier Tune (force) knobs
// are COLLAPSED behind a settings affordance that pops up ABOVE the bar on demand.
// The minimap is a DOCKED card bottom-right (rendered by Stage), not a popover
// here — matching the binding stage layout.
//
//   Navigate — a horizontal icon row of kit IconButtons: zoom in (+), zoom out
//              (−), fit (Maximize), reset (Crosshair). Camera commands only
//              (SceneController.command).
//   Layout   — the binding plain-language Network / Tree / Grouped / Timeline
//              picker, delegated to `LayoutSelector` (in `LensSelector.tsx`) so the
//              canonical layout control has ONE home.
//   Zoom     — a two-stop kit Slider Overview ↔ Detail driving the LOD descent
//              (granularity feature ↔ document). FLAGGED: rendered as a slider per
//              Figma but snaps to two stops, because the scene seam exposes no
//              absolute-zoom command (only incremental zoom-in/out, owned by
//              another builder); the flanking − / + issue real camera zoom.
//   Tune     — three plain-language kit Sliders mapping to the real d3-force knobs
//              (forceLayout.ts): Spacing → repel, Connection reach → linkDistance,
//              Clustering → linkForce. Lives in a COLLAPSED settings popover (a kit
//              Card) so the canvas is never occluded.
//
// figma-frontend-rewrite W03.P07.S10 / W04.P11.S17: the hand-built `NavBtn`/`Slider`
// primitives and the bespoke popover shell are RETIRED in favour of the centralized
// kit — Navigate + the freeze toggle + the flanking camera zoom are kit
// `IconButton`s, the Tune + Zoom-descent controls are kit `Slider`s, the settings
// trigger is a kit `DropdownButton`, and the popover body is a kit `Card`. Every
// control on screen now resolves to a real, shared kit definition
// (design-system-is-centralized).
//
// Layer ownership (dashboard-layer-ownership): app chrome steering the scene.
// Camera + layout affordances emit SceneController.command() ONLY; granularity is a
// stores write (viewStore.setGranularity); representation mode is a stores write
// (viewStore.setRepresentationMode) that Stage's single scene-owner effect turns
// into a scene command. The panel fetches nothing, reads no raw `tiers` block,
// holds no node shape. Icons are Lucide structural marks (the sanctioned chrome
// family) from the kit. Tokens only — no raw hex.

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Pause, Play, SlidersHorizontal } from "lucide-react";

import {
  Card,
  Crosshair,
  DropdownButton,
  IconButton,
  Maximize,
  Minus,
  Plus,
  Slider,
} from "../kit";
import type { LayoutParams } from "../../scene/field/forceLayout";
import { LAYOUT_DEFAULTS } from "../../scene/field/forceLayout";
import { useViewStore } from "../../stores/view/viewStore";
import { LayoutSelector } from "./LensSelector";
import { getScene } from "./Stage";

const ICON_PX = 15;

// A faint vertical hairline separating inline groups in the slim toolbar.
function Divider() {
  return <span className="mx-fg-1 h-6 w-px self-center bg-rule" aria-hidden />;
}

// ---------------------------------------------------------------------------
// Freeze toggle (graph-force-stability D7): Obsidian's pause. Emits a single
// `set-frozen` scene command and reflects the local frozen state. Meaningful only
// in connectivity mode (the deterministic modes hold the solver stopped), so it
// disables itself outside it. The cooling schedule stays fixed and unexposed; the
// collision/separation/damping knobs are NOT exposed (D7). A kit IconButton: the
// pressed (frozen) state reads through the kit's accent-subtle active treatment.
// ---------------------------------------------------------------------------

function FreezeToggle() {
  const scene = getScene();
  const representationMode = useViewStore((s) => s.activeRepresentationMode);
  const timelineMode = useViewStore((s) => s.timelineMode);
  const live = timelineMode.kind === "live";
  const connectivity = representationMode === "connectivity" && live;
  const [frozen, setFrozen] = useState(false);

  // A mode switch re-runs the solver, so a stale frozen flag must not persist.
  useEffect(() => {
    if (!connectivity && frozen) setFrozen(false);
  }, [connectivity, frozen]);

  function toggle() {
    const next = !frozen;
    setFrozen(next);
    scene.controller.command({ kind: "set-frozen", frozen: next });
  }

  return (
    <IconButton
      label={frozen ? "resume layout" : "freeze layout"}
      title={
        connectivity
          ? frozen
            ? "resume the force layout"
            : "freeze the force layout in place"
          : "freeze is available in the Network layout"
      }
      active={frozen}
      disabled={!connectivity}
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

function NavigateGroup() {
  const scene = getScene();
  return (
    <div
      className="flex items-center gap-fg-0-5"
      role="group"
      aria-label="Navigate"
      data-nav-group
    >
      <IconButton
        label="zoom in"
        onClick={() => scene.controller.command({ kind: "zoom-in" })}
      >
        <Plus size={ICON_PX} aria-hidden />
      </IconButton>
      <IconButton
        label="zoom out"
        onClick={() => scene.controller.command({ kind: "zoom-out" })}
      >
        <Minus size={ICON_PX} aria-hidden />
      </IconButton>
      <IconButton
        label="fit to view"
        title="fit all nodes into the viewport"
        onClick={() => scene.controller.command({ kind: "fit-to-view" })}
      >
        <Maximize size={ICON_PX} aria-hidden />
      </IconButton>
      <IconButton
        label="reset view"
        title="reset the camera to the origin"
        onClick={() => scene.controller.command({ kind: "reset-view" })}
      >
        <Crosshair size={ICON_PX} aria-hidden />
      </IconButton>
      <FreezeToggle />
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
}

function SettingsPopover({ label, icon, marker, children }: SettingsPopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className="relative flex items-center"
      ref={wrapRef}
      data-popover-group={marker}
    >
      <span data-popover-trigger>
        <DropdownButton
          label={label}
          ariaLabel={label}
          icon={icon}
          open={open}
          onClick={() => setOpen((v) => !v)}
        />
      </span>
      {open && (
        <Card
          id={panelId}
          elevation="overlay"
          padded={false}
          role="group"
          aria-label={label}
          className="absolute bottom-full right-0 z-30 mb-fg-2 flex flex-col gap-fg-2 bg-paper-raised/95 p-fg-3 backdrop-blur-sm"
          data-popover-panel
        >
          {children}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zoom (LOD descent): a two-stop kit Slider Overview ↔ Detail. 0 = feature
// overview, 1 = document detail. Snaps; no intermediate state exists on the wire.
// Disabled in time-travel (the driver owns the scene's data). Compact inline form:
// flanking − / + (kit IconButtons) camera zoom around the snap slider.
// ---------------------------------------------------------------------------

function ZoomGroup() {
  const granularity = useViewStore((s) => s.granularity);
  const setGranularity = useViewStore((s) => s.setGranularity);
  const timelineMode = useViewStore((s) => s.timelineMode);
  const timeTravelling = timelineMode.kind === "time-travel";
  const scene = getScene();

  const zoomValue = granularity === "document" ? 1 : 0;

  return (
    <div
      className={`flex items-center gap-fg-1 ${timeTravelling ? "opacity-40" : ""}`}
      role="group"
      aria-label="Zoom"
    >
      <IconButton
        label="zoom camera out"
        title="zoom the camera out"
        onClick={() => scene.controller.command({ kind: "zoom-out" })}
      >
        <Minus size={ICON_PX} aria-hidden />
      </IconButton>
      <div className="w-40">
        <LabelledSlider
          label="detail level"
          value={zoomValue}
          min={0}
          max={1}
          step={1}
          onChange={(v) => setGranularity(v >= 1 ? "document" : "feature")}
          format={(v) => (v >= 1 ? "Detail" : "Overview")}
          title="Overview shows the feature constellation; Detail shows the bounded document graph"
          ends={["Overview", "Detail"]}
        />
      </div>
      <IconButton
        label="zoom camera in"
        title="zoom the camera in"
        onClick={() => scene.controller.command({ kind: "zoom-in" })}
      >
        <Plus size={ICON_PX} aria-hidden />
      </IconButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tune group — the plain-language d3-force knobs (collapsed settings-popover body).
// ---------------------------------------------------------------------------

// The Figma names map onto the real driver knobs (forceLayout.ts LayoutParams):
//   Spacing          → repel        (node repulsion; higher = more space)
//   Connection reach → linkDistance (spring rest length between linked nodes)
//   Clustering       → linkForce    (spring stiffness; higher = tighter groups)
// `center` (gravity) has no plain-language home in the design and is left at its
// default — FLAGGED in the report.
const TUNE_DEFAULTS: Required<LayoutParams> = { ...LAYOUT_DEFAULTS };

/** Trailing-debounce window (ms) for ending a keyboard-driven slider interaction
 *  (D2): a key step has no pointerup, so end-interaction fires once the steps
 *  stop. Short enough that the field re-cools promptly, long enough to coalesce a
 *  burst of held-arrow steps into one interaction. */
const KEYBOARD_SETTLE_MS = 250;

function TuneBody() {
  const liveState = getScene().controller.getLayoutState();
  const [params, setParams] = useState<Required<LayoutParams>>({
    ...TUNE_DEFAULTS,
    ...liveState.params,
  });
  // Coalesce the held-warmth interaction (D2): begin once on the FIRST onChange/
  // pointer/key of a drag, hold it across the drag (the driver applies the latest
  // params each tick under the held alphaTarget — no per-onChange reheat kick),
  // and end on pointerup/blur or a trailing debounce for keyboard steps.
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

  // Stay in sync with layout-changed events (another actor may set params).
  useEffect(() => {
    return getScene().controller.on((event) => {
      if (event.kind === "layout-changed") {
        setParams((prev) => ({ ...prev, ...event.params }));
      }
    });
  }, []);

  // End any in-flight interaction if the popover unmounts mid-drag.
  useEffect(() => endInteraction, [endInteraction]);

  function apply(update: Partial<LayoutParams>) {
    const next = { ...params, ...update };
    setParams(next);
    // Ensure the held floor is up for the very first change of a drag (covers the
    // case where onChange fires before pointerdown handlers in some browsers).
    beginInteraction();
    getScene().controller.command({ kind: "set-layout-params", params: next });
    // Re-arm the keyboard settle each change; a pointerup/blur ends it sooner.
    armKeyboardSettle();
  }

  return (
    <div className="flex w-48 flex-col gap-fg-3">
      <LabelledSlider
        label="Spacing"
        title="How far nodes push each other apart"
        value={params.repel}
        min={0}
        max={400}
        step={10}
        onChange={(v) => apply({ repel: v })}
        format={(v) => String(Math.round(v))}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <LabelledSlider
        label="Connection reach"
        title="The rest length of the links between connected nodes"
        value={params.linkDistance}
        min={10}
        max={120}
        step={5}
        onChange={(v) => apply({ linkDistance: v })}
        format={(v) => String(Math.round(v))}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <LabelledSlider
        label="Clustering"
        title="How tightly connected nodes pull together into groups"
        value={params.linkForce}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => apply({ linkForce: v })}
        format={(v) => v.toFixed(2)}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The consolidated panel — a slim bottom-edge toolbar. Light groups inline; the
// heavy Tune group collapsed behind a settings popover trigger so the
// category-circle canvas is ALWAYS visible. `pointer-events-auto` is on the bar
// only, so the field reads through the space around it. The bar never spans the
// full stage: it sizes to its content and stays anchored at the bottom edge; on a
// narrow stage it scrolls horizontally rather than wrapping into a tall,
// canvas-covering block.
// ---------------------------------------------------------------------------

export function GraphControls() {
  return (
    <div
      className="pointer-events-none absolute bottom-fg-2 left-fg-2 z-20 flex"
      data-graph-controls-shell
    >
      <Card
        elevation="overlay"
        padded={false}
        className="pointer-events-auto flex max-w-full items-stretch bg-paper-raised/95 backdrop-blur-sm"
        role="group"
        aria-label="graph controls"
        data-graph-controls
      >
        {/* Inline light groups. This section alone scrolls horizontally on a
            narrow stage, so the bar never grows TALL (no wrap) and never covers
            the canvas. The settings trigger lives OUTSIDE this scroll region so
            its above-bar panel is not clipped by overflow. */}
        <div
          className="flex min-w-0 items-center gap-fg-1 overflow-x-auto px-fg-2 py-fg-1-5"
          data-graph-controls-inline
        >
          <NavigateGroup />
          <Divider />
          <LayoutSelector />
          <Divider />
          <ZoomGroup />
        </div>
        {/* Heavy Tune group, collapsed behind a settings popover trigger (canvas
            stays clear). Outside the scroll region so the popover body can
            overflow upward. */}
        <div className="flex items-center gap-fg-1 border-l border-rule px-fg-2 py-fg-1-5">
          <SettingsPopover
            label="Tune"
            marker="tune"
            icon={<SlidersHorizontal size={ICON_PX} aria-hidden />}
          >
            <TuneBody />
          </SettingsPopover>
        </div>
      </Card>
    </div>
  );
}
