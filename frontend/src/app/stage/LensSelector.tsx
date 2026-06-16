// Stage layout + salience selectors (figma-parity-reconciliation W03.P09.S53;
// graph-node-salience ADR; graph-layout-catalog ADR D11).
//
// This module owns the binding `graph/Controls` 88:2 LAYOUT control — the
// plain-language Network / Tree / Grouped / Timeline picker — and the distinct
// salience LENS selector (status / design). Both are dumb projections over the
// preserved view store (the stores layer is the sole wire client): switching the
// layout writes the representation mode, switching the lens writes the active
// salience lens (a wire re-query, folded into the graph-slice cache key).
//
// W03.P09.S53 — the Layout control is consolidated HERE so the canonical picker
// has one home; `GraphControls` renders `<LayoutSelector />` rather than carrying
// its own inline copy. The catalog is PRESERVED (graph-layout-catalog D11): the
// binding "Grouped" label organizes the clustering-family spatial modes, so the
// Spatial group surfaces the full preserved catalog — Network (connectivity),
// Tree (lineage), Layered (hierarchical), Radial (radial), Communities
// (community), Grouped by meaning (semantic) — under the binding plain-language
// framing, with Timeline kept DISTINCT as the temporal time-travel seam (it is
// not a spatial layout). No catalog mode is orphaned and no dead control ships.
//
// Layer ownership (dashboard-layer-ownership): app chrome reads + writes the view
// store; it never fetches the engine and never reads the raw tiers block. Icons
// are Lucide structural marks (the sanctioned chrome family). Tokens only — no
// raw hex; the type usages read the Figma role-named scale.

import { Compass, ScrollText } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useRef } from "react";

import type { RepresentationMode } from "../../scene/field/representationLayout";
import { SEMANTIC_MODE_GATE } from "../../scene/field/semanticGate";
import type { SalienceLens } from "../../stores/server/engine";
import { useViewStore } from "../../stores/view/viewStore";
import { movePlayhead } from "../timeline/Playhead";
import { useTimelineStore } from "../timeline/Timeline";

// ---------------------------------------------------------------------------
// Segmented control — a roving-tabstop group: one Tab-stop, arrow keys walk the
// segments. Shared by the Layout picker (the Spatial group and the distinct
// Timeline entry are each a Segmented).
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
  /** The active segment value, or null when no segment in this group is active
   *  (e.g. the Spatial group while time-travel owns the highlight). */
  active: T | null;
  onSelect: (value: T) => void;
}

function Segmented<T extends string>({
  label,
  segments,
  active,
  onSelect,
}: SegmentedProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  // Roving tabstop: the active segment owns the Tab-stop; when nothing in this
  // group is active (the Spatial group while Timeline owns the highlight), the
  // FIRST segment owns it so the group stays keyboard-reachable.
  const tabStopValue: T | null =
    active ?? (segments.length > 0 ? segments[0].value : null);

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
            tabIndex={seg.value === tabStopValue ? 0 : -1}
            onKeyDown={onKeyDown}
            onClick={() => onSelect(seg.value)}
            className={`flex items-center justify-center rounded-vs-sm px-vs-2 py-vs-1 text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-focus ${
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
// The binding Layout control — the plain-language graph/Controls 88:2 picker.
// ---------------------------------------------------------------------------

/** The Spatial group: the preserved layout catalog (graph-layout-catalog D11),
 *  surfaced under the binding plain-language framing. The three catalog modes
 *  (Layered/Radial/Communities) ship UN-GATED (D10) — no `available` flag. Only
 *  Grouped-by-meaning (semantic) carries the gate, reusing the existing
 *  `available` flag for the held mode. */
const SPATIAL_SEGMENTS = (semanticShipped: boolean): Segment<RepresentationMode>[] => [
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
    value: "hierarchical",
    label: "Layered",
    title: "Layered flow — a Sugiyama hierarchy over the structural backbone",
  },
  {
    value: "radial",
    label: "Radial",
    title: "Radial tree — hops from the most salient node outward",
  },
  {
    value: "community",
    label: "Communities",
    title: "Clustered by community — Louvain groups packed two-level",
  },
  {
    value: "semantic",
    label: "Grouped by meaning",
    title: semanticShipped
      ? "Clustered by meaning (embedding projection)"
      : "Clustered by meaning — falls back to Network until the semantic projection ships",
    available: semanticShipped,
  },
];

/** The Timeline entry, kept DISTINCT from the spatial modes (D11): it enters the
 *  temporal time-travel seam, not a spatial layout. */
const TIMELINE_SEGMENT: Segment<"timeline">[] = [
  {
    value: "timeline",
    label: "Timeline",
    title: "Arrange along time — enter the temporal view (time-travel)",
  },
];

/**
 * The binding Layout control (graph/Controls 88:2): the plain-language Network /
 * Tree / Grouped / Timeline picker over the PRESERVED representation-mode catalog.
 * Writes the representation mode into the view store (a stores write that Stage's
 * single scene-owner effect turns into a scene command); Timeline enters the
 * temporal time-travel seam (movePlayhead). Reflects time-travel as the active
 * Timeline segment and downgrades the held semantic mode honestly.
 */
export function LayoutSelector() {
  const representationMode = useViewStore((s) => s.activeRepresentationMode);
  const setRepresentationMode = useViewStore((s) => s.setRepresentationMode);
  const timelineMode = useViewStore((s) => s.timelineMode);
  const timeTravelling = timelineMode.kind === "time-travel";
  const corpusTo = useTimelineStore((s) => s.window.to);

  // The active spatial segment reflects the representation mode UNLESS time-travel
  // is active (then no spatial mode is active and Timeline owns the highlight).
  const spatialActive: RepresentationMode | null = timeTravelling
    ? null
    : representationMode;

  function onSpatial(value: RepresentationMode) {
    // Selecting a spatial mode returns to LIVE (leaving the temporal view) and
    // sets the representation mode.
    if (timeTravelling) movePlayhead("live");
    setRepresentationMode(value);
  }

  function onTimeline() {
    // Enter the temporal view at the corpus's latest instant (the real
    // time-travel seam — `movePlayhead`). This is the temporal mode, not a
    // spatial representation layout.
    movePlayhead(corpusTo);
  }

  return (
    <div className="flex items-center gap-vs-1" data-layout-picker>
      <Segmented
        label="spatial layout"
        segments={SPATIAL_SEGMENTS(SEMANTIC_MODE_GATE.shipped)}
        active={spatialActive}
        onSelect={onSpatial}
      />
      <Segmented
        label="temporal view"
        segments={TIMELINE_SEGMENT}
        active={timeTravelling ? "timeline" : null}
        onSelect={onTimeline}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Salience lens (graph-node-salience ADR, canvas-controls amendment W04.P12).
//
// Selects the active SALIENCE lens (status, design) — the viewer-intent parameter
// that, via DOI, drives both the per-lens importance field and the served node
// set. Switching the lens is a wire RE-QUERY (the lens folds into the graph slice
// cache key), so this control emits lens intent into the stores VIEW STORE — the
// stores layer is the sole wire client. Distinct from the named-filter-set lenses
// (the palette's saved filters) and the tier dial. The binding `graph/Controls`
// consolidation has no slot for the lens (a distinct concern from layout/zoom), so
// it stays docked on its own rather than being silently dropped — it remains a
// real, consumed capability.
// ---------------------------------------------------------------------------

interface LensOption {
  lens: SalienceLens;
  label: string;
  hint: string;
  Icon: typeof Compass;
}

/** The two launch lenses, in selector order (status is the default/first). */
export const LENS_OPTIONS: LensOption[] = [
  {
    lens: "status",
    label: "Status",
    hint: "What is in-flight: plans, progress, the pivotal bridges that gate work",
    Icon: Compass,
  },
  {
    lens: "design",
    label: "Design",
    hint: "Why the system is this way: the binding decisions and their grounding",
    Icon: ScrollText,
  },
];

export function LensSelector() {
  const lens = useViewStore((s) => s.activeLens);
  const setLens = useViewStore((s) => s.setActiveLens);

  return (
    <div
      role="group"
      aria-label="salience lens"
      className="flex items-center gap-vs-0-5 rounded-vs-md border border-rule bg-paper-raised/95 p-vs-0-5 shadow-card backdrop-blur-sm"
    >
      {LENS_OPTIONS.map(({ lens: l, label, hint, Icon }) => {
        const active = lens === l;
        return (
          <button
            key={l}
            type="button"
            role="switch"
            aria-checked={active}
            aria-label={`${label} lens`}
            title={hint}
            onClick={() => setLens(l)}
            className={[
              "flex items-center gap-vs-1 rounded-vs-sm px-vs-1-5 py-vs-0-5 text-label transition-colors duration-ui-fast ease-settle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
              active
                ? "border border-accent bg-accent-subtle text-ink"
                : "border border-transparent text-ink-muted hover:bg-paper-sunken hover:text-ink",
            ].join(" ")}
          >
            <Icon size={14} aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
