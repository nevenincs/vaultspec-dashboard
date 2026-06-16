// Consolidated graph controls (binding Figma redesign `graph/Controls` 88:2,
// `graph/Hero` 85:2): a COMPACT, NON-OCCLUDING edge overlay. The Hero binding
// shows the category-circle canvas CLEAN with the controls as an unobtrusive
// bottom-edge toolbar — never a panel that covers the field. So this surface is
// a single slim toolbar docked to the bottom edge: the light, always-reachable
// groups (Navigate, Layout, Zoom) sit inline, and the heavier groups (Tune
// sliders, Overview minimap) are COLLAPSED behind small affordances that pop
// up ABOVE the bar on demand — the canvas stays visible at every stage width,
// including the narrow ~450px 3-pane stage.
//
//   Navigate — a horizontal icon row: zoom in (+), zoom out (−), fit (□),
//              reset (◎). Camera commands only (SceneController.command).
//   Layout   — a segmented control Network · Tree · Grouped · Timeline:
//              Network  → representation mode "connectivity" (force topology)
//              Tree     → representation mode "lineage" (derivation DAG)
//              Grouped  → representation mode "semantic" (UMAP clustering)
//              Timeline → enters time-travel (the temporal lineage). FLAGGED:
//                         Timeline is NOT a spatial representation layout — the
//                         scene has no time-axis layout — so this segment is the
//                         entry point to the temporal mode (movePlayhead), and
//                         reflects `timelineMode === time-travel` as active.
//   Zoom     — a two-stop slider Overview ↔ Detail driving the LOD descent
//              (granularity feature ↔ document). FLAGGED: rendered as a slider
//              per Figma but snaps to two stops, because the scene seam exposes
//              no absolute-zoom command (only incremental zoom-in/out, owned by
//              another builder); the flanking − / + issue real camera zoom.
//   Tune     — three plain-language sliders mapping to the real d3-force knobs
//              (forceLayout.ts): Spacing → repel, Connection reach → linkDistance,
//              Clustering → linkForce. These names REPLACE the old Repel / Link
//              force / Link distance / Center grammar. The `center` knob has no
//              plain-language home in the design and is left at its default
//              (FLAGGED below); only knobs the driver actually has are exposed.
//              Lives in a COLLAPSED popover so the canvas is never occluded.
//   Overview — the minimap, also a COLLAPSED popover for the same reason.
//
// Layer ownership (dashboard-layer-ownership): app chrome steering the scene.
// Camera + layout affordances emit SceneController.command() ONLY; granularity
// is a stores write (viewStore.setGranularity); representation mode is a stores
// write (viewStore.setRepresentationMode) that Stage's single scene-owner effect
// turns into a scene command. The panel fetches nothing, reads no raw `tiers`
// block, holds no node shape. Icons are Lucide structural marks (the sanctioned
// chrome family). Tokens only — no raw hex.

import {
  ChevronDown,
  Crosshair,
  Map as MapIcon,
  Minus,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import type { LayoutParams } from "../../scene/field/forceLayout";
import { LAYOUT_DEFAULTS } from "../../scene/field/forceLayout";
import type { RepresentationMode } from "../../scene/field/representationLayout";
import { SEMANTIC_MODE_GATE } from "../../scene/field/semanticGate";
import { useViewStore } from "../../stores/view/viewStore";
import { movePlayhead } from "../timeline/Playhead";
import { useTimelineStore } from "../timeline/Timeline";
import { MinimapWidget } from "./MinimapWidget";
import { getScene } from "./Stage";

const ICON_PX = 15;

// A faint vertical hairline separating inline groups in the slim toolbar.
function Divider() {
  return <span className="mx-vs-1 h-6 w-px self-center bg-rule" aria-hidden />;
}

// ---------------------------------------------------------------------------
// Navigate — horizontal camera icon row (inline in the slim toolbar).
// ---------------------------------------------------------------------------

interface NavBtnProps {
  label: string;
  title?: string;
  icon: React.ReactNode;
  onClick: () => void;
}

function NavBtn({ label, title, icon, onClick }: NavBtnProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-vs-md text-ink-muted transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
    >
      {icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Freeze toggle (graph-force-stability D7): Obsidian's pause. Emits a single
// `set-frozen` scene command and reflects the local frozen state. Meaningful
// only in connectivity mode (the deterministic modes hold the solver stopped),
// so it disables itself outside it. The cooling schedule stays fixed and
// unexposed; the collision/separation/damping knobs are NOT exposed (D7).
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
    <button
      type="button"
      aria-label={frozen ? "resume layout" : "freeze layout"}
      aria-pressed={frozen}
      title={
        connectivity
          ? frozen
            ? "resume the force layout"
            : "freeze the force layout in place"
          : "freeze is available in the Network layout"
      }
      onClick={toggle}
      disabled={!connectivity}
      className="flex h-8 w-8 items-center justify-center rounded-vs-md text-ink-muted transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:bg-paper-sunken aria-pressed:text-ink"
      data-freeze-toggle
    >
      {frozen ? (
        <Play size={ICON_PX} aria-hidden />
      ) : (
        <Pause size={ICON_PX} aria-hidden />
      )}
    </button>
  );
}

function NavigateGroup() {
  const scene = getScene();
  return (
    <div
      className="flex items-center gap-vs-0-5"
      role="group"
      aria-label="Navigate"
      data-nav-group
    >
      <NavBtn
        label="zoom in"
        icon={<Plus size={ICON_PX} aria-hidden />}
        onClick={() => scene.controller.command({ kind: "zoom-in" })}
      />
      <NavBtn
        label="zoom out"
        icon={<Minus size={ICON_PX} aria-hidden />}
        onClick={() => scene.controller.command({ kind: "zoom-out" })}
      />
      <NavBtn
        label="fit to view"
        title="fit all nodes into the viewport"
        icon={<Square size={ICON_PX} aria-hidden />}
        onClick={() => scene.controller.command({ kind: "fit-to-view" })}
      />
      <NavBtn
        label="reset view"
        title="reset the camera to the origin"
        icon={<Crosshair size={ICON_PX} aria-hidden />}
        onClick={() => scene.controller.command({ kind: "reset-view" })}
      />
      <FreezeToggle />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented control — the Layout group (Network / Tree / Grouped / Timeline).
// A roving-tabstop group: one Tab-stop, arrow keys walk the segments.
// ---------------------------------------------------------------------------

interface Segment<T extends string> {
  value: T;
  label: string;
  title: string;
  /** When false, the segment is shown but reflects an unavailable state. */
  available?: boolean;
}

interface SegmentedProps<T extends string> {
  label: string;
  segments: Segment<T>[];
  active: T;
  onSelect: (value: T) => void;
}

function Segmented<T extends string>({
  label,
  segments,
  active,
  onSelect,
}: SegmentedProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback((e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const buttons = Array.from(
      groupRef.current?.querySelectorAll<HTMLButtonElement>("button[data-seg]") ?? [],
    );
    const at = buttons.indexOf(e.currentTarget);
    if (at === -1) return;
    const next =
      e.key === "ArrowRight"
        ? at + 1
        : e.key === "ArrowLeft"
          ? at - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    buttons[Math.min(buttons.length - 1, Math.max(0, next))]?.focus();
  }, []);

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={label}
      className="flex gap-vs-0-5 rounded-vs-md bg-paper-sunken p-vs-0-5"
    >
      {segments.map((seg) => {
        const isActive = seg.value === active;
        return (
          <button
            key={seg.value}
            type="button"
            data-seg
            aria-pressed={isActive}
            aria-label={seg.label}
            title={seg.title}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={onKeyDown}
            onClick={() => onSelect(seg.value)}
            className={`flex items-center justify-center rounded-vs-sm px-vs-2 py-vs-1 text-xs transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-focus ${
              isActive
                ? "bg-paper-raised font-medium text-ink shadow-card"
                : "text-ink-muted hover:text-ink"
            } ${seg.available === false ? "italic" : ""}`}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slider — the Tune knobs and the Zoom descent. A labelled native range input
// with a quiet readout, accent track, reduced-motion-safe (no transition on
// the thumb), no layout shift (fixed-height readout).
// ---------------------------------------------------------------------------

interface SliderProps {
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

function Slider({
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
}: SliderProps) {
  const display = format ? format(value) : String(value);
  return (
    <label className="flex w-full flex-col gap-vs-1" title={title}>
      <span className="flex h-3.5 items-center justify-between">
        <span className="text-label text-ink-muted">{label}</span>
        {!ends && (
          <span data-tabular className="text-2xs tabular-nums text-ink-faint">
            {display}
          </span>
        )}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={display}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={onInteractStart}
        onPointerUp={onInteractEnd}
        onKeyDown={onInteractStart}
        onBlur={onInteractEnd}
        className="h-1 w-full cursor-pointer accent-accent"
      />
      {ends && (
        <span className="flex justify-between text-2xs text-ink-faint">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </span>
      )}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Popover — a small collapsible group docked to a toolbar trigger. The heavy
// groups (Tune, Overview) live here so they are COLLAPSED by default and never
// occlude the canvas; the trigger is a slim labelled icon button, the body pops
// up ABOVE the bar (so it grows away from the field, not over it). Closes on
// outside click and Escape. Reduced-motion-safe: no entrance animation.
// ---------------------------------------------------------------------------

interface PopoverGroupProps {
  label: string;
  icon: React.ReactNode;
  /** data-attribute marker for tests / styling hooks. */
  marker: string;
  children: React.ReactNode;
}

function PopoverGroup({ label, icon, marker, children }: PopoverGroupProps) {
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
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 items-center gap-vs-1 rounded-vs-md px-vs-2 text-xs transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          open
            ? "bg-paper-sunken text-ink"
            : "text-ink-muted hover:bg-paper-sunken hover:text-ink"
        }`}
        data-popover-trigger
      >
        {icon}
        <span>{label}</span>
        <ChevronDown
          size={12}
          aria-hidden
          className={open ? "rotate-180" : undefined}
        />
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className="absolute bottom-full right-0 z-30 mb-vs-2 flex flex-col gap-vs-2 rounded-vs-lg border border-rule bg-paper-raised/95 p-vs-3 shadow-float backdrop-blur-sm"
          data-popover-panel
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout group: segmented mode control + the Zoom (LOD) descent.
// ---------------------------------------------------------------------------

const LAYOUT_SEGMENTS = (
  semanticShipped: boolean,
): Segment<RepresentationMode | "timeline">[] => [
  {
    value: "connectivity",
    label: "Network",
    title: "Force-directed topology — how everything links",
  },
  {
    value: "lineage",
    label: "Tree",
    title: "Derivation tree — research → adr → plan → exec → audit",
  },
  {
    value: "semantic",
    label: "Grouped",
    title: semanticShipped
      ? "Clustered by meaning (embedding projection)"
      : "Clustered by meaning — falls back to Network until the semantic projection ships",
    available: semanticShipped,
  },
  {
    value: "timeline",
    label: "Timeline",
    title: "Arrange along time — enter the temporal view (time-travel)",
  },
];

function LayoutGroup() {
  const representationMode = useViewStore((s) => s.activeRepresentationMode);
  const setRepresentationMode = useViewStore((s) => s.setRepresentationMode);
  const timelineMode = useViewStore((s) => s.timelineMode);
  const timeTravelling = timelineMode.kind === "time-travel";
  const corpusTo = useTimelineStore((s) => s.window.to);

  // The active segment: time-travel wins (Timeline reflects the temporal mode);
  // otherwise the representation mode. Semantic is downgraded honestly when its
  // gate is held, so the active segment reflects the APPLIED mode.
  const active: RepresentationMode | "timeline" = timeTravelling
    ? "timeline"
    : representationMode;

  function onSelect(value: RepresentationMode | "timeline") {
    if (value === "timeline") {
      // Enter the temporal view at the corpus's latest instant (the real
      // time-travel seam — `movePlayhead`). FLAGGED: this is the temporal mode,
      // not a spatial representation layout.
      movePlayhead(corpusTo);
      return;
    }
    // Selecting a spatial mode returns to LIVE (leaving the temporal view) and
    // sets the representation mode.
    if (timeTravelling) movePlayhead("live");
    setRepresentationMode(value);
  }

  return (
    <Segmented
      label="graph layout"
      segments={LAYOUT_SEGMENTS(SEMANTIC_MODE_GATE.shipped)}
      active={active}
      onSelect={onSelect}
    />
  );
}

// ---------------------------------------------------------------------------
// Zoom (LOD descent): a two-stop slider Overview ↔ Detail. 0 = feature
// overview, 1 = document detail. Snaps; no intermediate state exists on the
// wire. Disabled in time-travel (the driver owns the scene's data). Compact
// inline form: flanking − / + camera zoom around the snap slider.
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
      className={`flex w-36 items-center gap-vs-1 ${timeTravelling ? "opacity-40" : ""}`}
      role="group"
      aria-label="Zoom"
    >
      <button
        type="button"
        aria-label="zoom camera out"
        title="zoom the camera out"
        onClick={() => scene.controller.command({ kind: "zoom-out" })}
        className="text-base leading-none text-ink-muted transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        −
      </button>
      <div className="flex-1">
        <Slider
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
      <button
        type="button"
        aria-label="zoom camera in"
        title="zoom the camera in"
        onClick={() => scene.controller.command({ kind: "zoom-in" })}
        className="text-base leading-none text-ink-muted transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        +
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tune group — the plain-language d3-force knobs (collapsed popover body).
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
    <div className="flex w-44 flex-col gap-vs-3">
      <Slider
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
      <Slider
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
      <Slider
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
// The consolidated panel — a slim bottom-edge toolbar. Light groups inline;
// the heavy Tune + Overview groups collapsed behind popover triggers so the
// category-circle canvas is ALWAYS visible. `pointer-events-auto` is on the bar
// only, so the field reads through the space around it. The bar never spans the
// full stage: it sizes to its content and stays anchored at the bottom edge; on
// a narrow stage it scrolls horizontally rather than wrapping into a tall,
// canvas-covering block.
// ---------------------------------------------------------------------------

export function GraphControls() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-vs-2 z-20 flex justify-center px-vs-2"
      data-graph-controls-shell
    >
      <div
        className="pointer-events-auto flex max-w-full items-stretch rounded-vs-xl border border-rule bg-paper-raised/95 shadow-float backdrop-blur-sm"
        role="group"
        aria-label="graph controls"
        data-graph-controls
      >
        {/* Inline light groups. This section alone scrolls horizontally on a
            narrow stage, so the bar never grows TALL (no wrap) and never covers
            the canvas. The popover triggers live OUTSIDE this scroll region so
            their above-bar panels are not clipped by overflow. */}
        <div
          className="flex min-w-0 items-center gap-vs-1 overflow-x-auto px-vs-2 py-vs-1-5"
          data-graph-controls-inline
        >
          <NavigateGroup />
          <Divider />
          <LayoutGroup />
          <Divider />
          <ZoomGroup />
        </div>
        {/* Heavy groups, collapsed behind popover triggers (canvas stays clear).
            Outside the scroll region so the popover bodies can overflow upward. */}
        <div className="flex items-center gap-vs-1 border-l border-rule px-vs-2 py-vs-1-5">
          <PopoverGroup
            label="Tune"
            marker="tune"
            icon={<SlidersHorizontal size={ICON_PX} aria-hidden />}
          >
            <TuneBody />
          </PopoverGroup>
          <PopoverGroup
            label="Overview"
            marker="overview"
            icon={<MapIcon size={ICON_PX} aria-hidden />}
          >
            <MinimapWidget embedded />
          </PopoverGroup>
        </div>
      </div>
    </div>
  );
}
