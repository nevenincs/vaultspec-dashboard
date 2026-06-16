// Consolidated graph controls (binding Figma redesign `graph/Controls` 88:2):
// the four plain-language control groups that supersede the scattered
// NavToolbar / RepresentationModePanel / AlgorithmPanel / LOD-toggle surfaces.
//
//   Navigate — a vertical icon stack: zoom in (+), zoom out (−), fit (□),
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
//
// Layer ownership (dashboard-layer-ownership): app chrome steering the scene.
// Camera + layout affordances emit SceneController.command() ONLY; granularity
// is a stores write (viewStore.setGranularity); representation mode is a stores
// write (viewStore.setRepresentationMode) that Stage's single scene-owner effect
// turns into a scene command. The panel fetches nothing, reads no raw `tiers`
// block, holds no node shape. Icons are Lucide structural marks (the sanctioned
// chrome family). Tokens only — no raw hex.

import { Crosshair, Minus, Plus, Square } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
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

// ---------------------------------------------------------------------------
// Group label — the quiet faint-ink caption above every group (Figma 10px).
// ---------------------------------------------------------------------------

function GroupLabel({ children, id }: { children: string; id?: string }) {
  return (
    <span
      id={id}
      className="text-2xs font-medium uppercase tracking-wide text-ink-faint"
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Navigate — vertical camera icon stack (raised paper card on rule border).
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

function NavigateGroup() {
  const scene = getScene();
  return (
    <div className="flex flex-col gap-vs-2" data-nav-group>
      <GroupLabel>Navigate</GroupLabel>
      <div className="flex flex-col gap-vs-0-5 rounded-vs-lg border border-rule bg-paper-raised p-vs-1 shadow-panel">
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
        <span className="my-vs-0-5 h-px w-full bg-rule" aria-hidden />
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
      </div>
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
            className={`flex items-center justify-center rounded-vs-sm px-vs-3 py-vs-1 text-xs transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-focus ${
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
  const granularity = useViewStore((s) => s.granularity);
  const setGranularity = useViewStore((s) => s.setGranularity);
  const representationMode = useViewStore((s) => s.activeRepresentationMode);
  const setRepresentationMode = useViewStore((s) => s.setRepresentationMode);
  const timelineMode = useViewStore((s) => s.timelineMode);
  const timeTravelling = timelineMode.kind === "time-travel";
  const corpusTo = useTimelineStore((s) => s.window.to);

  const scene = getScene();

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

  // Zoom (LOD descent): a two-stop slider Overview ↔ Detail. 0 = feature
  // overview, 1 = document detail. Snaps; no intermediate state exists on the
  // wire. Disabled in time-travel (the driver owns the scene's data).
  const zoomValue = granularity === "document" ? 1 : 0;

  return (
    <div className="flex flex-col gap-vs-6" data-layout-group>
      <div className="flex flex-col gap-vs-2">
        <GroupLabel>Layout</GroupLabel>
        <Segmented
          label="graph layout"
          segments={LAYOUT_SEGMENTS(SEMANTIC_MODE_GATE.shipped)}
          active={active}
          onSelect={onSelect}
        />
      </div>

      <div className="flex flex-col gap-vs-2">
        <GroupLabel>Zoom</GroupLabel>
        <div
          className={`flex items-center gap-vs-2 ${timeTravelling ? "opacity-40" : ""}`}
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview group — the minimap. The MinimapWidget owns the scene-registered
// canvas; here it is hosted inside the consolidated panel's Overview column.
// ---------------------------------------------------------------------------

function OverviewGroup() {
  return (
    <div className="flex flex-col gap-vs-2" data-overview-group>
      <GroupLabel>Overview</GroupLabel>
      <MinimapWidget embedded />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tune group — the plain-language d3-force knobs.
// ---------------------------------------------------------------------------

// The Figma names map onto the real driver knobs (forceLayout.ts LayoutParams):
//   Spacing          → repel        (node repulsion; higher = more space)
//   Connection reach → linkDistance (spring rest length between linked nodes)
//   Clustering       → linkForce    (spring stiffness; higher = tighter groups)
// `center` (gravity) has no plain-language home in the design and is left at its
// default — FLAGGED in the report.
const TUNE_DEFAULTS: Required<LayoutParams> = { ...LAYOUT_DEFAULTS };

function TuneGroup() {
  const liveState = getScene().controller.getLayoutState();
  const [params, setParams] = useState<Required<LayoutParams>>({
    ...TUNE_DEFAULTS,
    ...liveState.params,
  });

  // Stay in sync with layout-changed events (another actor may set params).
  useEffect(() => {
    return getScene().controller.on((event) => {
      if (event.kind === "layout-changed") {
        setParams((prev) => ({ ...prev, ...event.params }));
      }
    });
  }, []);

  function apply(update: Partial<LayoutParams>) {
    const next = { ...params, ...update };
    setParams(next);
    getScene().controller.command({ kind: "set-layout-params", params: next });
  }

  return (
    <div className="flex flex-col gap-vs-2" data-tune-group>
      <GroupLabel>Tune</GroupLabel>
      <div className="flex w-44 flex-col gap-vs-3 rounded-vs-lg border border-rule bg-paper-raised p-vs-3 shadow-panel">
        <Slider
          label="Spacing"
          title="How far nodes push each other apart"
          value={params.repel}
          min={0}
          max={400}
          step={10}
          onChange={(v) => apply({ repel: v })}
          format={(v) => String(Math.round(v))}
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
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The consolidated panel.
// ---------------------------------------------------------------------------

export function GraphControls() {
  return (
    <div
      className="pointer-events-auto absolute bottom-vs-2 left-vs-2 z-20 flex max-w-[calc(100%-1rem)] flex-wrap items-start gap-x-vs-6 gap-y-vs-3 rounded-vs-xl border border-rule bg-paper-raised/95 px-vs-4 py-vs-3 shadow-float backdrop-blur-sm"
      role="group"
      aria-label="graph controls"
      data-graph-controls
    >
      <NavigateGroup />
      <LayoutGroup />
      <OverviewGroup />
      <TuneGroup />
    </div>
  );
}
