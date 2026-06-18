// The relational phase-lane timeline (dashboard-timeline ADR "Representation" /
// "Interaction", W03.P06): the corpus's diachronic lineage view. Lanes are the
// framework pipeline phases (research/reference · adr · plan · exec · review ·
// codify); each dated document is an INDIVIDUAL dot at its blob-true creation
// instant, drawn at full opacity in the doc type's bound category color. The
// ALWAYS-ON surface is dated marks ONLY — no arcs by default. Relations are an
// ON-DEMAND overlay (see Interaction).
//
// Dot layout (timeline fidelity rework): the engine positions a document by its
// `created` date, which is DAY-precision — every document authored on one day
// shares a single x. Rather than draw them on top of one another (the old
// overlapping-blot defect), the marks are packed by `./dotLayout` into per-lane
// stacked columns fanning AWAY from the central axis: a dense day reads as a
// legible tower of individual dots over its date, and a column too tall for the
// lane budget collapses its overflow into one quiet density marker rather than
// hiding documents. The pack is pure + deterministic (the engine's id-sorted node
// order makes the stack stable across rerenders).
//
// Scroll model: a zoomable pixels-per-time scale + a scroll offset, LIVE docked
// at the right, scrolling left walks back in time; marks are virtualized to the
// visible range plus a margin and held under a belt-and-suspenders client cap, so
// the surface stays bounded at any corpus age. Dots, the playhead, the range band,
// and the month ticks all position through the SAME `timeToX`, so they align.
//
// Layer ownership (dashboard-layer-ownership / ADR "Layer ownership"): this is
// app-chrome. It reads the lineage slice through the stores hook and the
// degradation state through a stores selector, and emits select/hover intent back
// through shared state. It fetches nothing, defines no node/edge shape, reads no
// raw `tiers` block, and re-mints no stable id.
//
// W03.P08.S11 (figma-frontend-rewrite): re-skinned to the binding AppShell timeline
// panel (Figma SlhonORmySdoSMTQgDWw3w, AppShell 117:2). The six pipeline phases
// collapse into TWO event lanes — a top "design" lane (research · decisions · plans
// · audits) over a bottom "execution" lane (steps · summaries) — per the binding
// board (figma-is-the-binding-source-of-truth). The lane TOKENS and per-phase
// visibility keys are unchanged data identity; the grouping is purely visual.

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { LineageArc, LineageNode } from "../../stores/server/engine";
import {
  DEFAULT_PX_PER_MS,
  fitTimelineViewportForScope,
  setTimelineScrollOffset,
  setTimelineViewport,
  setTimelineViewportWidth,
  timelineCorpusFitKey,
  useTimelineAutoFittedCorpusKey,
  useTimelineAutoFittedScope,
  useTimelineLaneVisibility,
  useTimelineScrollState,
} from "../../stores/view/timeline";
import { createDashboardScene } from "../../scene/field/fieldAssembly";
import {
  useActiveScope,
  useDashboardDateRangeView,
  useFiltersVocabularyView,
  useTimelineLineageView,
} from "../../stores/server/queries";
import { setHoveredNodeId } from "../../stores/view/selection";
import { useElementHeight, useElementWidth } from "../chrome/useElementWidth";
import { useSurfaceStates } from "../degradation/useDegradation";
import { categoryColorVar, type Category, type CategoryToken } from "../kit/category";
// Side-effect import: registers the timeline's event-mark menu resolver at load
// (the contributed-menus model; the resolver module is owned by the
// dashboard-context-menus surface and consumed by the generic menu host).
import "./menus/eventMarkMenu";
import { type ArcInput, type ArcState } from "./arcs";
import {
  DOT_PX,
  computeDotGeometry,
  layoutDots,
  type DotInput,
  type DotLayout,
} from "./dotLayout";
import { Minimap } from "./Minimap";
import {
  PHASE_LANES,
  groupIndexOf,
  laneGroupLabelLines,
  type PhaseLane,
  type TimelineLaneGroup,
  TIMELINE_LANE_GROUPS,
} from "./phaseLanes";
import {
  TIMELINE_ORIGIN_MS,
  clampPxPerMs,
  panScrollOffset,
  timeToStripX,
  timeToX,
  visibleRange,
  zoomAt,
} from "./scrollStrip";
import { lineageToTemporalScene, type TemporalSceneResult } from "./temporalScene";

// --- retained event helpers (unit-tested) ---------------------------------------

/** A short human label for an event kind (retained for accessible names). */
export function eventKindLabel(kind: string): string {
  if (kind === "commit") return "commit";
  if (kind === "doc-created") return "document created";
  if (kind === "doc-modified") return "document modified";
  return kind.replace(/-/g, " ");
}

/** Engine-side bucketing at coarse zooms, raw marks at fine zoom (retained). */
export function bucketForSpan(spanMs: number): "raw" | "1h" | "1d" {
  const DAY = 24 * 3600 * 1000;
  if (spanMs <= 3 * DAY) return "raw";
  if (spanMs <= 45 * DAY) return "1h";
  return "1d";
}

/** Human-time label for an ISO instant (date + minute), tabular-rendered. */
export function humanInstant(ts: string | number): string {
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

/**
 * The canonical minute-precision ISO instant (`yyyy-mm-ddThh:mmZ`) for the
 * playhead slider's `aria-valuetext` (S62): an unambiguous ISO form for assistive
 * tech, distinct from `humanInstant`'s space-separated reading.
 */
export function isoInstant(ts: string | number): string {
  return `${new Date(ts).toISOString().slice(0, 16)}Z`;
}

// --- timeline view state ------------------------------------------------------------

/**
 * Timeline view state lives in `stores/view/timeline`; re-exported here so
 * existing timeline consumers do not reach into the store path directly.
 */
export { DEFAULT_PX_PER_MS };
export { PHASE_LANES, type PhaseLane };

// --- pure render-prep helpers (unit-testable, no DOM) ----------------------------

// The binding two-lane rail (figma-frontend-rewrite W03.P08.S11, AppShell 117:2):
// each lane shows a middot-joined category label in a left gutter, then the lane
// rule and the dated marks. Figma frame 266:943 starts the graph field at x=124;
// the split design label lives in the 12..116 rail, with an 8px gap before marks.
const GROUP_LABEL_W = 124;
const GRAPH_RIGHT_PAD = 12;
/** The x of the lane-group label text in the rail gutter. */
const LANE_LABEL_X = 12;
/** Virtualization margin (px) so a mark partly off-screen stays drawn. */
const VIRTUAL_MARGIN_PX = 120;
const WHEEL_ZOOM_FACTOR = 1.0018;
const KEY_PAN_FRACTION = 0.18;
const KEY_ZOOM_FACTOR = 1.2;

function isTimelineGestureTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(
    element?.closest(
      "button,a,input,textarea,select,[role='slider'],[data-playhead-grip],[data-range-band],[data-timeline-dot]",
    ),
  );
}

// Lollipop mark geometry (binding board 239:714): each dated document is a colored
// DOT on a thin STEM connecting to a single central axis — design marks rise ABOVE
// the axis, execution marks fall BELOW it. The dot fills with the doc type's bound
// category color (the same hue its graph node paints), so dot and node agree. The
// `DOT_PX` diameter and the per-lane stacking geometry live in `./dotLayout`, the
// single home for the placement algorithm; the axis y is derived per render from
// the measured chart height (`computeDotGeometry`) so the stack budget adapts on
// resize.

/** First-of-month instants within [fromMs, toMs] — the month gridline ticks the
 *  board paints across the top of the chart (Apr / May / Jun). Pure. */
export function monthTicks(fromMs: number, toMs: number): number[] {
  const ticks: number[] = [];
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return ticks;
  }
  const d = new Date(fromMs);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  for (let guard = 0; d.getTime() <= toMs && guard < 120; guard++) {
    ticks.push(d.getTime());
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return ticks;
}

export function monthAxisLabels(
  fromMs: number,
  toMs: number,
  width: number,
): { key: number; label: string; x: number }[] {
  const ticks = monthTicks(fromMs, toMs);
  if (ticks.length === 0 || width <= GROUP_LABEL_W) return [];
  const graphWidth = Math.max(1, width - GROUP_LABEL_W - GRAPH_RIGHT_PAD);
  const slotWidth = graphWidth / ticks.length;
  return ticks.map((t, i) => ({
    key: t,
    label: new Date(t).toLocaleDateString("en-US", { month: "short" }),
    x: GROUP_LABEL_W + 5 + i * slotWidth,
  }));
}

/** The instant a node's mark is positioned at (blob-true creation), or null. */
export function nodeInstant(node: LineageNode): number | null {
  const created = node.dates?.created;
  if (!created) return null;
  const t = Date.parse(created);
  return Number.isFinite(t) ? t : null;
}

export function timelineDotInputs(
  nodes: readonly LineageNode[],
  range: { fromMs: number; toMs: number },
  laneVisibility: Record<PhaseLane, boolean>,
  pxPerMs: number,
  scrollOffset: number,
): DotInput[] {
  const inputs: DotInput[] = [];
  for (const node of nodes) {
    const t = nodeInstant(node);
    if (t == null || t < range.fromMs || t > range.toMs) continue;
    const group = groupIndexOf(node);
    if (group !== 0 && group !== 1) continue;
    const phase = node.phase;
    if (
      typeof phase === "string" &&
      PHASE_LANES.includes(phase as PhaseLane) &&
      !laneVisibility[phase as PhaseLane]
    ) {
      continue;
    }
    inputs.push({
      id: node.id,
      x: timeToX(t, TIMELINE_ORIGIN_MS, pxPerMs, scrollOffset),
      group,
    });
  }
  return inputs;
}

/**
 * The count of DISTINCT nodes joined to `nodeId` by at least one arc (S63: the
 * "joined-node count" the mark announces). This is the 1-hop neighbour count —
 * distinct from `degree` (total incident edges, which can double-count a pair
 * joined by more than one tier of arc). Pure; reads only the arc endpoints.
 */
export function joinedNodeCount(arcs: readonly ArcInput[], nodeId: string): number {
  const neighbours = new Set<string>();
  for (const arc of arcs) {
    if (arc.src === nodeId) neighbours.add(arc.dst);
    else if (arc.dst === nodeId) neighbours.add(arc.src);
  }
  return neighbours.size;
}

export function temporalNodeAccessibleLabel(
  node: LineageNode,
  bucketCount: number,
  incidentCount: number,
): string {
  const title = node.title || node.id;
  const day = node.dates?.created
    ? new Date(node.dates.created).toISOString().slice(0, 10)
    : "undated";
  const type = node.doc_type || "document";
  return `${title}, ${type}, ${day}, ${bucketCount} document${bucketCount === 1 ? "" : "s"} on this day, ${incidentCount} joined node${incidentCount === 1 ? "" : "s"}`;
}

export function temporalDebugText(
  sceneData: TemporalSceneResult,
  rendererDebug: {
    representationMode: { applied: string; staticLayout: boolean };
    simulationState: { active: boolean; running: boolean; alpha: number } | null;
    rendererLifecycle: string;
    droppedEdges: number;
  },
  degraded: boolean,
): string[] {
  const simulation = rendererDebug.simulationState;
  const densest = sceneData.debug.densestBucket;
  return [
    `mode ${rendererDebug.representationMode.applied}${rendererDebug.representationMode.staticLayout ? " static" : ""}`,
    `nodes ${sceneData.debug.visibleNodeCount}`,
    `edges ${sceneData.debug.visibleEdgeCount}`,
    `buckets ${sceneData.debug.bucketCount}`,
    `densest ${densest ? `${densest.key} ${densest.count}` : "none"}`,
    `sim ${simulation ? `${simulation.running ? "running" : "paused"} alpha ${simulation.alpha.toFixed(2)}` : "none"}`,
    `engine ${rendererDebug.rendererLifecycle}`,
    `dropped ${rendererDebug.droppedEdges}`,
    sceneData.truncated
      ? `nodes shown ${sceneData.truncated.returned}/${sceneData.truncated.total}`
      : "nodes shown all",
    sceneData.edgeTruncated
      ? `edges shown ${sceneData.edgeTruncated.returned}/${sceneData.edgeTruncated.total}`
      : "edges shown all",
    degraded ? "degraded reconnecting" : "degraded no",
  ];
}

function compactDayLabel(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso.slice(0, 10);
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface TimelineTimeWindow {
  fromMs: number;
  toMs: number;
}

export interface TimelineBoundedWindow extends TimelineTimeWindow {
  empty: boolean;
}

function orderedTimelineWindow(window: TimelineTimeWindow): TimelineTimeWindow {
  return window.fromMs <= window.toMs
    ? window
    : { fromMs: window.toMs, toMs: window.fromMs };
}

function finiteCorpusWindow(
  bounds: { from?: string; to?: string } | undefined,
): TimelineTimeWindow | null {
  const fromMs = bounds?.from ? Date.parse(bounds.from) : NaN;
  const toMs = bounds?.to ? Date.parse(bounds.to) : NaN;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    return null;
  }
  return { fromMs, toMs };
}

export function intersectTimelineWindows(
  a: TimelineTimeWindow,
  b: TimelineTimeWindow,
): TimelineBoundedWindow {
  const left = orderedTimelineWindow(a);
  const right = orderedTimelineWindow(b);
  const fromMs = Math.max(left.fromMs, right.fromMs);
  const toMs = Math.min(left.toMs, right.toMs);
  return fromMs <= toMs
    ? { fromMs, toMs, empty: false }
    : { fromMs, toMs: fromMs, empty: true };
}

export function timelineQueryWindow(
  viewportRange: TimelineTimeWindow,
  cropWindow: TimelineTimeWindow,
  corpusBounds: { from?: string; to?: string } | undefined,
): TimelineBoundedWindow {
  const cropped = intersectTimelineWindows(viewportRange, cropWindow);
  if (cropped.empty) return cropped;
  const corpus = finiteCorpusWindow(corpusBounds);
  return corpus ? intersectTimelineWindows(cropped, corpus) : cropped;
}

export function temporalFieldLegendItems(
  sceneData: TemporalSceneResult,
  visibleWindow?: { fromMs: number; toMs: number },
): { key: string; label: string; value: string }[] {
  const densest = sceneData.debug.densestBucket;
  const from = visibleWindow
    ? new Date(visibleWindow.fromMs).toISOString()
    : sceneData.debug.range.from;
  const to = visibleWindow
    ? new Date(visibleWindow.toMs).toISOString()
    : sceneData.debug.range.to;
  return [
    {
      key: "range",
      label: "Range",
      value: `${compactDayLabel(from)} → ${compactDayLabel(to)}`,
    },
    {
      key: "docs",
      label: "Docs",
      value: `${sceneData.debug.visibleNodeCount}`,
    },
    {
      key: "days",
      label: "Days",
      value: `${sceneData.debug.bucketCount}`,
    },
    {
      key: "busiest",
      label: "Busiest day",
      value: densest
        ? `${compactDayLabel(`${densest.key}T00:00:00Z`)} · ${densest.count} docs`
        : "none",
    },
  ];
}

/** A 1-hop ego set: the hovered node plus every node one arc away from it. */
export function egoNodeIds(
  arcs: readonly ArcInput[],
  nodeId: string | null,
): Set<string> {
  const ego = new Set<string>();
  if (nodeId == null) return ego;
  ego.add(nodeId);
  for (const arc of arcs) {
    if (arc.src === nodeId) ego.add(arc.dst);
    if (arc.dst === nodeId) ego.add(arc.src);
  }
  return ego;
}

/**
 * Map a wire `relation` to a structural arc resolution state when it names one,
 * else undefined (the arc draws in the resolved/active hue). The shipped graph
 * carries resolution state on its structural mentions; until the richer
 * `derivation` field lands the relation string is the available signal.
 */
export function structuralStateOf(relation: string | undefined): ArcState | undefined {
  if (relation === "stale" || relation === "broken" || relation === "resolved") {
    return relation;
  }
  return undefined;
}

// --- the component --------------------------------------------------------------------

/** Marks/extensions other steps dock into the timeline surface. */
export interface TimelineSurfaceProps {
  /**
   * Select intent for a lineage mark — emitted up to the shared selection. The
   * surface owns the arc set, so it hands the visible-slice arcs alongside the
   * node; the wired handler (`eventSelection.handleNodeClick`) derives the
   * BOUNDED 1-hop ego join from them for the stage pulse, without the chrome
   * needing to know the lineage shape (dashboard-layer-ownership). The arcs
   * argument is optional so a bare `(node) => void` consumer still type-checks.
   */
  onNodeClick?: (node: LineageNode, arcs: readonly LineageArc[]) => void;
  overlay?: React.ReactNode;
}

function TemporalGraphCanvas({
  sceneData,
  arcs,
  degraded,
  onNodeClick,
  setHoverIntent,
}: {
  sceneData: TemporalSceneResult;
  arcs: readonly LineageArc[];
  degraded: boolean;
  onNodeClick?: (node: LineageNode, arcs: readonly LineageArc[]) => void;
  setHoverIntent: (id: string | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ReturnType<typeof createDashboardScene> | null>(null);
  if (sceneRef.current === null) sceneRef.current = createDashboardScene();
  const scene = sceneRef.current;
  const [debug, setDebug] = useState(() => scene.field.debugSnapshot());

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    scene.controller.mount(host);
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) scene.controller.resize(rect.width, rect.height);
    });
    observer.observe(host);
    const timer = window.setInterval(() => {
      setDebug(scene.field.debugSnapshot());
    }, 250);
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
      setHoverIntent(null);
      scene.controller.destroy();
    };
  }, [scene, setHoverIntent]);

  // Read the click handler inputs through refs so this scene subscription binds
  // ONCE per scene rather than every render. An unstable dep here (e.g. an inline
  // `onNodeClick` prop, new each render) would re-run the effect every render, and
  // its cleanup fires `setHoverIntent(null)` — a dashboard-state PATCH — on every
  // re-run, which re-renders and loops (the `hovered_id:null` PATCH flood that
  // crashed the shell). Keeping the deps to the stable `[scene, setHoverIntent]`
  // breaks the loop while preserving the hover/select behaviour.
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;
  const arcsRef = useRef(arcs);
  arcsRef.current = arcs;
  const sceneDataRef = useRef(sceneData);
  sceneDataRef.current = sceneData;

  useEffect(() => {
    const off = scene.controller.on((event) => {
      if (event.kind === "hover") {
        setHoverIntent(event.id);
      }
      if (event.kind === "select" && event.id) {
        const node = sceneDataRef.current.nodeById.get(event.id);
        if (node) onNodeClickRef.current?.(node, arcsRef.current);
      }
    });
    return () => {
      off();
      setHoverIntent(null);
    };
  }, [scene, setHoverIntent]);

  useEffect(() => {
    scene.controller.command({
      kind: "set-data",
      nodes: sceneData.nodes,
      edges: sceneData.edges,
    });
    scene.controller.command({
      kind: "set-edge-render-params",
      params: { lineWidthScale: 0.35 },
    });
    scene.controller.command({ kind: "set-representation-mode", mode: "temporal" });
    scene.controller.command({ kind: "set-simulation-active", active: false });
    const frame = window.requestAnimationFrame(() => {
      scene.controller.command({ kind: "fit-to-view" });
      setDebug(scene.field.debugSnapshot());
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scene, sceneData.edges, sceneData.nodes]);

  const debugLines = temporalDebugText(sceneData, debug, degraded);
  const showDebug =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("timelineDebug") === "1";

  return (
    <div className="absolute inset-0" data-timeline-cosmos-canvas>
      <div
        ref={hostRef}
        className="pointer-events-none absolute inset-0 opacity-0"
        data-timeline-graph-field
      />
      {showDebug && <TemporalBucketOverlay sceneData={sceneData} />}
      <TemporalAccessibleNodes
        sceneData={sceneData}
        arcs={arcs}
        onNodeClick={onNodeClick}
        setHoverIntent={setHoverIntent}
      />
      {showDebug && (
        <div
          className="pointer-events-none absolute right-fg-2 top-fg-1 flex max-w-[min(42rem,calc(100%-1rem))] flex-wrap justify-end gap-x-fg-2 gap-y-fg-0-5 rounded-fg-xs border border-rule bg-paper-raised/90 px-fg-1-5 py-fg-1 text-caption text-ink-muted shadow-fg-raised"
          data-timeline-debug
        >
          {debugLines.map((line) => (
            <span key={line} className="whitespace-nowrap tabular-nums">
              {line}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TemporalFieldLegend({
  sceneData,
  visibleWindow,
}: {
  sceneData: TemporalSceneResult;
  visibleWindow: { fromMs: number; toMs: number };
}) {
  const items = temporalFieldLegendItems(sceneData, visibleWindow);
  const slots: Record<string, { labelX: number; valueX: number; width: number }> = {
    range: { labelX: 0, valueX: 30, width: 103 },
    docs: { labelX: 114, valueX: 140, width: 74 },
    days: { labelX: 174, valueX: 200, width: 42 },
    busiest: { labelX: 214, valueX: 272, width: 150 },
  };
  return (
    <div
      className="pointer-events-none relative h-[12px] w-full shrink-0 whitespace-nowrap text-[10px] leading-[12px] text-ink-muted"
      role="list"
      aria-label="timeline field legend"
      data-timeline-field-legend
    >
      {items.map((item) => {
        const slot = slots[item.key];
        if (!slot) return null;
        return (
          <span
            key={item.key}
            className="absolute top-0 block h-[12px]"
            style={{ left: `${slot.labelX}px`, width: `${slot.width}px` }}
            role="listitem"
            data-timeline-legend-role={item.key}
          >
            <span className="absolute top-0 text-ink-muted" style={{ left: 0 }}>
              {item.label}
            </span>
            <span
              data-tabular
              className="absolute top-0 font-semibold text-ink"
              style={{ left: `${slot.valueX - slot.labelX}px` }}
            >
              {item.value}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function TemporalBucketOverlay({ sceneData }: { sceneData: TemporalSceneResult }) {
  const { width, height } = sceneData.debug.viewport;
  if (width <= 0 || height <= 0 || sceneData.buckets.length === 0) return null;
  const maxCount = Math.max(...sceneData.buckets.map((bucket) => bucket.count), 1);
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-timeline-bucket-guides
    >
      {sceneData.buckets.map((bucket) => {
        const radius = Math.max(8, Math.min(bucket.radius * 0.42, 28));
        const heat = 0.025 + (bucket.count / maxCount) * 0.045;
        return (
          <g key={bucket.key} data-timeline-bucket-guide={bucket.key}>
            <line
              x1={bucket.x}
              x2={bucket.x}
              y1={12}
              y2={height - 12}
              className="stroke-accent/15"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={bucket.x}
              cy={bucket.y}
              r={radius}
              className="fill-accent-subtle stroke-accent/45"
              opacity={heat}
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
              data-timeline-hotspot={bucket.key}
            />
            {bucket.count > 1 && (
              <title>{`${bucket.count} documents on ${bucket.key}`}</title>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const CATEGORY_TOKENS = new Set<CategoryToken>([
  "adr",
  "audit",
  "code",
  "exec",
  "feature",
  "index",
  "plan",
  "research",
]);

function dotCategory(node: LineageNode | undefined): Category {
  const type = node?.doc_type;
  return type && CATEGORY_TOKENS.has(type as CategoryToken)
    ? (type as CategoryToken)
    : "code";
}

function TimelineAxisLayer({
  axisY,
  width,
  height,
}: {
  axisY: number;
  width: number;
  height: number;
}) {
  if (width <= 0 || height <= 0) return null;
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="lineage timeline"
      data-timeline-axis-layer
    >
      <line
        x1={GROUP_LABEL_W}
        x2={width}
        y1={axisY}
        y2={axisY}
        className="stroke-rule-strong"
        vectorEffect="non-scaling-stroke"
        data-timeline-axis
      />
    </svg>
  );
}

function TimelineMonthAxis({
  visibleWindow,
  width,
}: {
  visibleWindow: { fromMs: number; toMs: number };
  width: number;
}) {
  const labels = monthAxisLabels(visibleWindow.fromMs, visibleWindow.toMs, width);
  if (labels.length === 0) return null;
  return (
    <div
      className="pointer-events-none relative h-[20px] shrink-0 bg-paper"
      aria-hidden="true"
      data-timeline-month-axis
    >
      {labels.map((item) => (
        <span
          key={item.key}
          className="absolute top-[2px] whitespace-nowrap text-caption font-normal text-ink-muted"
          style={{ left: `${item.x}px` }}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

function TimelineDotLayer({
  layout,
  axisY,
  nodeById,
  arcs,
  onNodeClick,
  setHoverIntent,
  width,
  height,
}: {
  layout: DotLayout;
  axisY: number;
  nodeById: Map<string, LineageNode>;
  arcs: readonly LineageArc[];
  onNodeClick?: (node: LineageNode, arcs: readonly LineageArc[]) => void;
  setHoverIntent: (id: string | null) => void;
  width: number;
  height: number;
}) {
  if (
    width <= 0 ||
    height <= 0 ||
    (layout.dots.length === 0 && layout.clusters.length === 0)
  ) {
    return null;
  }
  return (
    <svg
      className="absolute inset-0 h-full w-full overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-timeline-dot-layer
    >
      {layout.dots.map((dot) => {
        const node = nodeById.get(dot.id);
        const color = categoryColorVar(dotCategory(node));
        return (
          <g
            key={dot.id}
            className="cursor-pointer"
            data-timeline-dot={dot.id}
            onPointerEnter={() => setHoverIntent(dot.id)}
            onPointerLeave={() => setHoverIntent(null)}
            onClick={(event) => {
              event.stopPropagation();
              if (node) onNodeClick?.(node, arcs);
            }}
          >
            <line
              x1={dot.x}
              x2={dot.x}
              y1={axisY}
              y2={dot.y}
              className="stroke-rule-strong"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              opacity={0.85}
            />
            <circle
              cx={dot.x}
              cy={dot.y}
              r={DOT_PX / 2}
              fill={color}
              stroke="var(--color-paper)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
      {layout.clusters.map((cluster) => (
        <g
          key={cluster.id}
          data-timeline-dot-cluster={cluster.id}
          data-timeline-dot-cluster-count={cluster.count}
        >
          <line
            x1={cluster.x}
            x2={cluster.x}
            y1={axisY}
            y2={cluster.y}
            className="stroke-rule-strong"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            opacity={0.55}
          />
          <circle
            cx={cluster.x}
            cy={cluster.y}
            r={DOT_PX / 2 + Math.min(4, Math.log2(cluster.count + 1))}
            className="fill-paper stroke-rule-strong"
            vectorEffect="non-scaling-stroke"
            opacity={0.85}
          />
          <circle
            cx={cluster.x}
            cy={cluster.y}
            r={DOT_PX / 2}
            fill={categoryColorVar(dotCategory(nodeById.get(cluster.ids[0])))}
            vectorEffect="non-scaling-stroke"
          />
          <title>{`${cluster.count} more documents in this column`}</title>
        </g>
      ))}
    </svg>
  );
}

function TemporalAccessibleNodes({
  sceneData,
  arcs,
  onNodeClick,
  setHoverIntent,
}: {
  sceneData: TemporalSceneResult;
  arcs: readonly LineageArc[];
  onNodeClick?: (node: LineageNode, arcs: readonly LineageArc[]) => void;
  setHoverIntent: (id: string | null) => void;
}) {
  return (
    <div className="sr-only" data-timeline-accessible-nodes>
      <ul aria-label="timeline graph documents">
        {sceneData.nodes.map((sceneNode) => {
          const node = sceneData.nodeById.get(sceneNode.id);
          if (!node) return null;
          const bucket = sceneData.bucketById.get(sceneNode.id);
          const label = temporalNodeAccessibleLabel(
            node,
            bucket?.count ?? 1,
            joinedNodeCount(arcs, node.id),
          );
          return (
            <li key={node.id}>
              <button
                type="button"
                aria-label={label}
                onFocus={() => setHoverIntent(node.id)}
                onBlur={() => setHoverIntent(null)}
                onClick={() => onNodeClick?.(node, arcs)}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Timeline({ onNodeClick, overlay }: TimelineSurfaceProps = {}) {
  const scope = useActiveScope();
  const { pxPerMs, scrollOffset } = useTimelineScrollState();
  const laneVisibility = useTimelineLaneVisibility();
  const hostRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollOffset: number;
  } | null>(null);
  const width = useElementWidth(hostRef) ?? 800;
  // The chart area (the lineage canvas above the navigator band) drives the
  // dot-pack geometry: the axis sits at its vertical center and each lane's stack
  // budget is sized from its half-height, so the dot layout adapts when the
  // timeline is resized rather than packing against a fixed-height assumption.
  const chartRef = useRef<HTMLDivElement>(null);
  const chartHeight = useElementHeight(chartRef) ?? 140;
  const geom = useMemo(() => computeDotGeometry(chartHeight), [chartHeight]);

  useEffect(() => {
    setTimelineViewportWidth(width);
  }, [width]);

  const setHoverIntent = useCallback((hoveredId: string | null) => {
    setHoveredNodeId(hoveredId);
  }, []);

  // Auto-fit the corpus into view on first load and on scope change, so the
  // timeline SHOWS its data by default. The scroll-strip origin is the epoch, so
  // an un-positioned default viewport (`scrollOffset: 0`) opens decades from the
  // corpus and renders nothing until the user finds fit-all — the "displays
  // nothing regardless of data" defect. The engine-enumerated corpus date bounds
  // (`/filters`, independent of the range-bounded lineage fetch, so no empty-
  // range deadlock) give the span to fit. Runs ONCE per scope: after the initial
  // fit the user's scroll/zoom is respected until the source corpus bounds change;
  // a new scope or new bounds re-fits its own corpus.
  const vocabulary = useFiltersVocabularyView(scope);
  const corpusBounds = vocabulary.dateBounds;
  const zoomAround = useCallback(
    (cursorX: number, factor: number) => {
      const next = zoomAt(pxPerMs, scrollOffset, cursorX, factor);
      setTimelineViewport(next.pxPerMs, next.scrollOffset);
    },
    [pxPerMs, scrollOffset],
  );
  const panBy = useCallback(
    (deltaPx: number) => {
      setTimelineScrollOffset(panScrollOffset(scrollOffset, deltaPx));
    },
    [scrollOffset],
  );
  const jumpToCorpusEdge = useCallback(
    (edge: "start" | "end") => {
      const raw =
        edge === "start"
          ? corpusBounds?.from
            ? Date.parse(corpusBounds.from)
            : NaN
          : corpusBounds?.to
            ? Date.parse(corpusBounds.to)
            : Date.now();
      const tMs = Number.isFinite(raw) ? raw : Date.now();
      const next =
        edge === "start"
          ? timeToStripX(tMs, TIMELINE_ORIGIN_MS, pxPerMs) - 24
          : timeToStripX(tMs, TIMELINE_ORIGIN_MS, pxPerMs) - width + 24;
      setTimelineScrollOffset(Math.max(0, next));
    },
    [corpusBounds?.from, corpusBounds?.to, pxPerMs, width],
  );
  const onTimelineWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey || event.altKey) {
        const rect = event.currentTarget.getBoundingClientRect();
        const cursorX = event.clientX - rect.left;
        zoomAround(cursorX, Math.pow(WHEEL_ZOOM_FACTOR, -event.deltaY));
        return;
      }
      const dominantDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      panBy(dominantDelta);
    },
    [panBy, zoomAround],
  );
  const onTimelinePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        event.button !== 0 ||
        event.shiftKey ||
        isTimelineGestureTarget(event.target)
      ) {
        return;
      }
      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startScrollOffset: scrollOffset,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus();
      event.preventDefault();
    },
    [scrollOffset],
  );
  const onTimelinePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      setTimelineScrollOffset(
        panScrollOffset(pan.startScrollOffset, pan.startX - event.clientX),
      );
    },
    [],
  );
  const onTimelinePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      panRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );
  const onTimelineKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (isTimelineGestureTarget(event.target)) return;
      const panStep = width * KEY_PAN_FRACTION;
      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          panBy(-panStep);
          break;
        case "ArrowRight":
          event.preventDefault();
          panBy(panStep);
          break;
        case "Home":
          event.preventDefault();
          jumpToCorpusEdge("start");
          break;
        case "End":
          event.preventDefault();
          jumpToCorpusEdge("end");
          break;
        case "+":
        case "=":
          event.preventDefault();
          zoomAround(width / 2, KEY_ZOOM_FACTOR);
          break;
        case "-":
        case "_":
          event.preventDefault();
          zoomAround(width / 2, 1 / KEY_ZOOM_FACTOR);
          break;
        default:
          break;
      }
    },
    [jumpToCorpusEdge, panBy, width, zoomAround],
  );
  const fittedScope = useTimelineAutoFittedScope();
  const fittedCorpusKey = useTimelineAutoFittedCorpusKey();
  const corpusFitKey = timelineCorpusFitKey(scope, corpusBounds);
  const corpusFitSatisfied =
    fittedCorpusKey === corpusFitKey ||
    (fittedCorpusKey === null && fittedScope === scope);
  useEffect(() => {
    if (scope == null || width <= 0) return;
    if (!corpusFitKey || corpusFitSatisfied) return;
    const fromMs = corpusBounds?.from ? Date.parse(corpusBounds.from) : NaN;
    if (!Number.isFinite(fromMs)) return; // wait for the bounds (or no dated corpus)
    const toRaw = corpusBounds?.to ? Date.parse(corpusBounds.to) : Date.now();
    const toMs = Number.isFinite(toRaw) ? toRaw : Date.now();
    const inset = 24;
    const usable = Math.max(1, width - inset * 2);
    const px = clampPxPerMs(usable / Math.max(1, toMs - fromMs));
    const offset = Math.max(0, timeToStripX(fromMs, TIMELINE_ORIGIN_MS, px) - inset);
    fitTimelineViewportForScope(scope, px, offset, corpusFitKey);
  }, [
    scope,
    corpusBounds?.from,
    corpusBounds?.to,
    width,
    corpusFitKey,
    corpusFitSatisfied,
  ]);
  // While the corpus auto-fit is still pending (the vocabulary bounds are loading,
  // or they are known but not yet applied for this scope), the default scroll
  // viewport has NOT been positioned onto the data. Suppress the "no lineage" empty
  // state during that interval so the surface never flashes a false "no data" before
  // the fit lands — show the loading scaffold instead. Once bounds are absent (a
  // genuinely undated corpus) or the fit has applied, the real empty state shows.
  const autoFitPending = vocabulary.loading || (!!corpusFitKey && !corpusFitSatisfied);

  // Degradation truth, pre-derived from the stores layer (ADR "States"): never
  // read from a transport error, never the raw `tiers` block. The RECONNECTING
  // row (stream loss) is the timeline's designed degraded state — read here, not
  // guessed from a fetch rejection (degradation-is-read-from-tiers-not-guessed-
  // from-errors).
  const surface = useSurfaceStates().timeline;
  const degraded = surface === "reconnecting";

  // The visible time range for the current scroll position (virtualized + margin)
  // bounds the read at any corpus age (graph-queries-are-bounded-by-default).
  const viewportRange = useMemo(
    () => visibleRange(scrollOffset, width, pxPerMs, VIRTUAL_MARGIN_PX),
    [scrollOffset, width, pxPerMs],
  );
  const visibleWindow = useMemo(
    () => visibleRange(scrollOffset, width, pxPerMs, 0),
    [scrollOffset, width, pxPerMs],
  );
  const dashboardWindow = useDashboardDateRangeView(scope, visibleWindow);
  const cropWindow = useMemo(() => {
    if (dashboardWindow.source === "dashboard") {
      return orderedTimelineWindow(dashboardWindow);
    }
    const corpus = finiteCorpusWindow(corpusBounds);
    return corpus ?? visibleWindow;
  }, [
    corpusBounds,
    dashboardWindow.fromMs,
    dashboardWindow.source,
    dashboardWindow.toMs,
    visibleWindow,
  ]);
  const range = useMemo(
    () => timelineQueryWindow(viewportRange, cropWindow, corpusBounds),
    [corpusBounds, cropWindow, viewportRange],
  );

  // The sole wire read: the FULL bounded lineage set for the scope, fetched ONCE
  // and held in memory. The viewport window and the start/end crop are NOT part of
  // the query identity, so navigation (scroll/zoom) and setting the date range are
  // CONTINUOUS in-memory windowing operations over this dataset (see `range` →
  // `lineageToTemporalScene` and the dot virtualization), never a refetch — the
  // internal state is never destroyed and reloaded as the window changes. The
  // dataset reloads ONLY on a bespoke backend signal: a graph generation bump
  // (the SSE delta clock invalidates the `lineage` subtree), and `placeholderData`
  // keeps the prior set rendered across that refresh so the surface never blanks.
  // (The playhead drives stage time-travel ONLY; the marks render the live corpus
  // and never refetch per playhead instant — the hook keeps its `asOf` param as a
  // harmless capability the timeline never drives.)
  const lineage = useTimelineLineageView(scope);

  // A visual lane group is drawn when ANY of its phase tokens is visible. The
  // design lane stays on; the execution lane is toggled by the control bar's
  // "Steps & summaries" switch (which flips its exec + codify phase keys together).
  const groupVisible = (g: TimelineLaneGroup) =>
    g.phases.some((p) => laneVisibility[p]);

  const { loading, errored, nodes, arcs } = lineage;
  const overviewInstants = useMemo(
    () =>
      nodes.flatMap((node) => {
        const tMs = nodeInstant(node);
        return tMs === null ? [] : [{ tMs, category: dotCategory(node) }];
      }),
    [nodes],
  );

  const temporalScene = useMemo(
    () =>
      lineageToTemporalScene({
        nodes,
        arcs,
        range,
        laneVisibility,
        pxPerMs,
        scrollOffset,
        width,
        height: chartHeight,
      }),
    [nodes, arcs, range, laneVisibility, pxPerMs, scrollOffset, width, chartHeight],
  );
  const timelineDots = useMemo(
    () =>
      layoutDots(
        timelineDotInputs(
          [...temporalScene.nodeById.values()],
          range,
          laneVisibility,
          pxPerMs,
          scrollOffset,
        ),
        geom,
      ),
    [geom, laneVisibility, pxPerMs, range, scrollOffset, temporalScene.nodeById],
  );

  const hasMarks = temporalScene.nodes.length > 0;

  const noHistory =
    scope != null &&
    !loading &&
    !errored &&
    !autoFitPending &&
    !hasMarks &&
    (surface === "empty" || surface === "normal" || surface === "lifecycle-sparse");

  return (
    <div
      ref={hostRef}
      className="relative flex h-full flex-col bg-paper pt-[2px] select-none"
      data-timeline
    >
      <TimelineMonthAxis visibleWindow={visibleWindow} width={width} />
      {/* The lineage chart fills the region above the navigator band; its measured
          height drives the dot-pack geometry. The playhead + range overlay are
          scoped to THIS area (not the navigator) so they never cover the scrubber. */}
      <div
        ref={chartRef}
        className="relative min-h-0 flex-1 cursor-grab bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus active:cursor-grabbing"
        role="region"
        tabIndex={0}
        aria-label="timeline viewport"
        onWheel={onTimelineWheel}
        onPointerDown={onTimelinePointerDown}
        onPointerMove={onTimelinePointerMove}
        onPointerUp={onTimelinePointerUp}
        onPointerCancel={onTimelinePointerUp}
        onKeyDown={onTimelineKeyDown}
      >
        {!loading && !errored && hasMarks && (
          <TemporalGraphCanvas
            sceneData={temporalScene}
            arcs={arcs}
            degraded={degraded}
            onNodeClick={onNodeClick}
            setHoverIntent={setHoverIntent}
          />
        )}
        {/* Central axis (binding board 239:714): ONE soft horizontal rule from the
            label gutter to the right edge. It must sit ABOVE the Cosmos canvas,
            otherwise the canvas ground hides the scaffold in the live renderer. */}
        <TimelineAxisLayer axisY={geom.axisY} width={width} height={chartHeight} />
        {!loading && !errored && hasMarks && (
          <TimelineDotLayer
            layout={timelineDots}
            axisY={geom.axisY}
            nodeById={temporalScene.nodeById}
            arcs={arcs}
            onNodeClick={onNodeClick}
            setHoverIntent={setHoverIntent}
            width={width}
            height={chartHeight}
          />
        )}

        {/* Lane-group rail labels (binding AppShell 117:2): the design lane breaks
            over two gutter lines ("Research · Decisions" / "Plans · Audits"), and
            execution stays a single line. Decorative; focusable controls are the
            dated marks. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {TIMELINE_LANE_GROUPS.map((group) => {
            if (!groupVisible(group)) return null;
            // Binding AppShell 117:2 fixes the lane rail copy to the 100px chart
            // grammar: design labels at y=78/90 and execution at y=142 in the
            // 212px surface. Relative to the chart's y=66 band, those are top
            // offsets 12 and 76, independent of the axis midpoint.
            const top = group.id === "design" ? 12 : 76;
            return (
              <span
                key={group.id}
                data-lane-rail={group.id}
                className="absolute flex flex-col whitespace-nowrap text-[9px] font-normal leading-[12px] text-ink-muted"
                style={{ left: `${LANE_LABEL_X}px`, top: `${top}px` }}
              >
                {laneGroupLabelLines(group).map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </span>
            );
          })}
        </div>

        {/* Loading / positioning: a quiet copy-toned liveness line — the lane
            scaffold stays visible, so the surface never flashes empty (ADR
            "States"). Also shown while the corpus auto-fit is pending. */}
        {(loading || autoFitPending) && (
          <div
            className="pointer-events-none absolute left-fg-2 top-1/2 flex -translate-y-1/2 items-center gap-fg-1 text-caption text-ink-faint"
            role="status"
            data-timeline-loading
          >
            <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-state-live" />
            reading the timeline…
          </div>
        )}

        {/* Empty / no-history: approachable, never an error. */}
        {noHistory && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-caption text-ink-faint"
            role="status"
            data-timeline-empty
          >
            {surface === "lifecycle-sparse"
              ? "lineage appears as documents gain dates"
              : "no lineage in this range yet"}
          </div>
        )}

        {/* Degraded-from-tiers (S59): the DESIGNED degraded state, read pre-derived
            from the stores degradation layer (RECONNECTING on stream loss) — never
            guessed from a transport error. */}
        {degraded && !errored && (
          <div
            className="pointer-events-none absolute top-fg-1 right-fg-2 flex items-center gap-fg-1 rounded-fg-pill bg-paper-raised/95 px-fg-1-5 py-fg-0-5 text-caption text-state-stale shadow-fg-raised"
            role="status"
            aria-live="polite"
            data-timeline-degraded
          >
            <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-state-stale" />
            reconnecting — showing the last lineage
          </div>
        )}

        {/* Error: a contained, copy-toned message scoped to the timeline. */}
        {errored && (
          <div
            className="absolute left-fg-2 top-1/2 flex -translate-y-1/2 items-center gap-fg-2 text-caption text-ink-muted"
            role="alert"
            data-timeline-error
          >
            <span>couldn’t load the timeline</span>
            <button
              type="button"
              onClick={lineage.retry}
              className="rounded-fg-xs bg-paper-sunken px-fg-1-5 py-fg-0-5 text-ink transition-colors duration-ui-fast ease-settle hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              retry
            </button>
          </div>
        )}

        {overlay}
      </div>

      {/* The range navigator / scrubber: a dedicated band docked at the bottom edge
          (its own row, no longer overlapping the marks) showing the WHOLE corpus
          span with the visible window as a draggable brush — click/drag to scrub. */}
      <div className="shrink-0 bg-paper pb-[6px]" data-timeline-scrubber>
        <Minimap
          viewportWidth={width}
          overviewInstants={overviewInstants}
          fieldLegend={
            !loading && !errored && hasMarks ? (
              <TemporalFieldLegend
                sceneData={temporalScene}
                visibleWindow={cropWindow}
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}
