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
  setTimelineViewportWidth,
  timelineCorpusFitKey,
  useTimelineAutoFittedCorpusKey,
  useTimelineAutoFittedScope,
  useTimelineLaneVisibility,
  useTimelineScrollState,
} from "../../stores/view/timeline";
import {
  fitTimelineScopeToCorpus,
  jumpTimelineNavigationToCorpusEdge,
  panTimelineNavigation,
  zoomTimelineNavigationAt,
} from "../../stores/view/timelineIntent";
import {
  deriveTimelineSurfaceChromeView,
  useActiveScope,
  useDashboardDateRangeView,
  useFiltersVocabularyView,
  useTimelineLineageFilterArg,
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
import { PHASE_LANES, groupIndexOf, type PhaseLane } from "./phaseLanes";
import { TIMELINE_ORIGIN_MS, timeToX, visibleRange } from "./scrollStrip";
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

/**
 * The month-axis tick marks (binding board 251:771 / 253:807…): a tall MAJOR tick
 * at each month boundary plus three short MINOR ticks evenly subdividing the gap to
 * the next month (the weekly-grid feel of the binding design). Positioned on the
 * SAME slot grid as `monthAxisLabels` (the label sits 5px right of its major tick),
 * so the ticks and the month names align. Pure.
 */
export function monthAxisTicks(
  fromMs: number,
  toMs: number,
  width: number,
): { key: string; x: number; major: boolean }[] {
  const labels = monthAxisLabels(fromMs, toMs, width);
  if (labels.length === 0) return [];
  const slotWidth = labels.length > 1 ? labels[1].x - labels[0].x : 0;
  const ticks: { key: string; x: number; major: boolean }[] = [];
  for (const label of labels) {
    const tickX = label.x - 5;
    ticks.push({ key: `M${label.key}`, x: tickX, major: true });
    if (slotWidth > 0) {
      for (let q = 1; q <= 3; q++) {
        ticks.push({
          key: `m${label.key}-${q}`,
          x: tickX + (slotWidth * q) / 4,
          major: false,
        });
      }
    }
  }
  return ticks;
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

export function timelineDocumentCountText(
  visibleDocuments: number,
  totalDocuments: number,
): string {
  return `${visibleDocuments.toLocaleString("en-US")} visible of ${totalDocuments.toLocaleString("en-US")} total documents`;
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
  onNodeClick,
  setHoverIntent,
}: {
  sceneData: TemporalSceneResult;
  arcs: readonly LineageArc[];
  onNodeClick?: (node: LineageNode, arcs: readonly LineageArc[]) => void;
  setHoverIntent: (id: string | null) => void;
}) {
  // The timeline's graph view is PURE SVG (the dot / axis layers); the sr-only
  // accessible-node layer is its only interactive surface. The scene field that
  // used to mount here was vestigial - an invisible (opacity-0, pointer-events-none)
  // canvas whose sole consumer was an optional debug snapshot - so it was removed in
  // the graph-backend-unification cutover. No graph rendering moves to three.js for
  // the timeline; its graph is SVG.
  const showDebug =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("timelineDebug") === "1";

  return (
    <div className="absolute inset-0">
      {showDebug && <TemporalBucketOverlay sceneData={sceneData} />}
      <TemporalAccessibleNodes
        sceneData={sceneData}
        arcs={arcs}
        onNodeClick={onNodeClick}
        setHoverIntent={setHoverIntent}
      />
    </div>
  );
}

function TemporalDocumentCountPill({
  visibleDocuments,
  totalDocuments,
}: {
  visibleDocuments: number;
  totalDocuments: number;
}) {
  const label = timelineDocumentCountText(visibleDocuments, totalDocuments);
  return (
    <div
      className="pointer-events-none absolute bottom-[0.125rem] left-[0.75rem] flex h-[1.125rem] items-center gap-fg-1-5 rounded-fg-xs border border-rule bg-paper/90 px-fg-2 text-[0.625rem] leading-[0.75rem] text-ink-muted shadow-fg-raised"
      aria-label="timeline document count"
      data-timeline-field-legend
    >
      <span className="sr-only">{label}</span>
      <span data-tabular aria-hidden="true">
        {visibleDocuments.toLocaleString("en-US")} visible
      </span>
      <span className="font-semibold text-ink">of</span>
      <span data-tabular aria-hidden="true">
        {totalDocuments.toLocaleString("en-US")} total documents
      </span>
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
  "exec",
  "feature",
  "plan",
  "research",
]);

function dotCategory(node: LineageNode | undefined): Category {
  const type = node?.doc_type;
  return type && CATEGORY_TOKENS.has(type as CategoryToken)
    ? (type as CategoryToken)
    : "reference";
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
        x1={0}
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
  const ticks = monthAxisTicks(visibleWindow.fromMs, visibleWindow.toMs, width);
  return (
    <div
      className="pointer-events-none relative h-[1.25rem] shrink-0 overflow-hidden bg-paper"
      aria-hidden="true"
      data-timeline-month-axis
    >
      {ticks.map((tick) => (
        <span
          key={tick.key}
          className={`absolute top-0 w-px bg-rule ${tick.major ? "h-[0.375rem]" : "h-[0.1875rem]"}`}
          style={{ left: `${tick.x}px` }}
          data-timeline-month-tick={tick.major ? "major" : "minor"}
        />
      ))}
      {labels.map((item) => (
        <span
          key={item.key}
          className="absolute top-[0.125rem] whitespace-nowrap text-caption font-medium tracking-[0.025rem] text-ink-faint"
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

/** Stable option id for a mark, the aria-activedescendant target. */
function markOptionId(nodeId: string): string {
  return `tl-mark-${nodeId}`;
}

// The accessible mark cursor (keyboard-navigation W05.P08.S25). The corpus's
// marks live as one focusable `role="listbox"` carrying an aria-activedescendant
// cursor over per-mark `role="option"` items — ONE tab stop. Arrows / Home / End
// traverse the marks (highlighting the visual dot through the existing hover
// intent), Enter / Space selects. This replaces the per-mark button enumeration
// being individual tab stops (the W01.P03.S08 containment) with a true cursor.
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
  const nodes = sceneData.nodes;
  const [cursor, setCursor] = useState(0);
  const at = Math.min(cursor, Math.max(0, nodes.length - 1));
  const cursoredId = nodes[at]?.id ?? null;

  const move = (next: number) => {
    if (nodes.length === 0) return;
    const i = Math.min(nodes.length - 1, Math.max(0, next));
    setCursor(i);
    const id = nodes[i]?.id;
    if (id) setHoverIntent(id);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    // A consumed key is stopped so it never reaches the global keymap dispatcher
    // (bare arrows = graph cycling) — the Class-B widget-key isolation.
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        e.stopPropagation();
        move(at + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        e.stopPropagation();
        move(at - 1);
        break;
      case "Home":
        e.preventDefault();
        e.stopPropagation();
        move(0);
        break;
      case "End":
        e.preventDefault();
        e.stopPropagation();
        move(nodes.length - 1);
        break;
      case "Enter":
      case " ": {
        e.preventDefault();
        e.stopPropagation();
        const node = cursoredId ? sceneData.nodeById.get(cursoredId) : null;
        if (node) onNodeClick?.(node, arcs);
        break;
      }
      default:
        break;
    }
  };

  return (
    <div className="sr-only" data-timeline-accessible-nodes>
      <ul
        role="listbox"
        aria-label="timeline graph documents"
        tabIndex={0}
        aria-activedescendant={cursoredId ? markOptionId(cursoredId) : undefined}
        onKeyDown={onKeyDown}
        onBlur={() => setHoverIntent(null)}
      >
        {nodes.map((sceneNode, i) => {
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
                id={markOptionId(node.id)}
                role="option"
                aria-selected={i === at}
                // Not a tab stop: the listbox is the one tab stop and the cursor
                // points here via aria-activedescendant. Pointer click still selects.
                tabIndex={-1}
                aria-label={label}
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
      zoomTimelineNavigationAt(pxPerMs, scrollOffset, cursorX, factor);
    },
    [pxPerMs, scrollOffset],
  );
  const panBy = useCallback(
    (deltaPx: number) => {
      panTimelineNavigation(scrollOffset, deltaPx);
    },
    [scrollOffset],
  );
  const jumpToCorpusEdge = useCallback(
    (edge: "start" | "end") => {
      jumpTimelineNavigationToCorpusEdge(edge, corpusBounds, pxPerMs, width);
    },
    [corpusBounds, pxPerMs, width],
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
      panTimelineNavigation(pan.startScrollOffset, pan.startX - event.clientX);
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
      // Every key this viewport consumes is stopped (not just preventDefault'd) so
      // it never reaches the global keymap dispatcher's window listener — the bare
      // arrows are bound there to graph feature/neighbour cycling, so a pan that
      // only preventDefault'd would ALSO walk the graph (Class-B isolation; the
      // every-composite-navigates-through-the-one-focuszone rule; review HIGH).
      const consume = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      switch (event.key) {
        case "ArrowLeft":
          consume();
          panBy(-panStep);
          break;
        case "ArrowRight":
          consume();
          panBy(panStep);
          break;
        case "ArrowUp":
        case "ArrowDown":
          // Not a pan/zoom verb, but still stopped so it does not bubble to the
          // global feature-cycle bindings while the viewport holds focus.
          event.stopPropagation();
          break;
        case "Home":
          consume();
          jumpToCorpusEdge("start");
          break;
        case "End":
          consume();
          jumpToCorpusEdge("end");
          break;
        case "+":
        case "=":
          consume();
          zoomAround(width / 2, KEY_ZOOM_FACTOR);
          break;
        case "-":
        case "_":
          consume();
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
    fitTimelineScopeToCorpus(scope, corpusBounds, width, corpusFitKey);
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
  // The canonical facet filter (unified-filter-plane D3) DOES fold into the query
  // identity: a feature filter set in the rail, or a category toggled on the graph,
  // narrows the timeline's lineage exactly as it narrows the graph. Like the
  // generation bump, a filter change is one new bounded query (placeholderData
  // keeps the prior set rendered); the viewport stays out of identity, so scroll
  // and zoom remain pure in-memory windowing.
  const lineageFilter = useTimelineLineageFilterArg(scope);
  const lineage = useTimelineLineageView(scope, {}, lineageFilter);

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
  const timelineChrome = deriveTimelineSurfaceChromeView({
    scopePresent: scope != null,
    loading,
    errored,
    autoFitPending,
    hasMarks,
    surface,
  });

  return (
    <div
      ref={hostRef}
      className="relative flex h-full flex-col bg-paper pt-fg-0-5 select-none"
      data-timeline
    >
      <TimelineMonthAxis visibleWindow={visibleWindow} width={width} />
      {/* The lineage chart fills the region above the navigator band; its measured
          height drives the dot-pack geometry. The playhead + range overlay are
          scoped to THIS area (not the navigator) so they never cover the scrubber. */}
      <div
        ref={chartRef}
        className="relative min-h-0 flex-1 cursor-grab bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-0.125rem] focus-visible:outline-focus active:cursor-grabbing"
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
            onNodeClick={onNodeClick}
            setHoverIntent={setHoverIntent}
          />
        )}
        {/* Central axis (binding board 239:714): ONE soft horizontal rule from the
            label gutter to the right edge. It must sit ABOVE the graph canvas,
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

        {/* Loading / positioning: a quiet copy-toned liveness line — the lane
            scaffold stays visible, so the surface never flashes empty (ADR
            "States"). Also shown while the corpus auto-fit is pending. */}
        {timelineChrome.showLoading && (
          <div
            className={timelineChrome.loadingClassName}
            role="status"
            data-timeline-loading
          >
            <span className={timelineChrome.loadingDotClassName} />
            {timelineChrome.loadingLabel}
          </div>
        )}

        {/* Empty / no-history: approachable, never an error. */}
        {timelineChrome.showEmpty && (
          <div
            className={timelineChrome.emptyClassName}
            role="status"
            data-timeline-empty
          >
            {timelineChrome.emptyLabel}
          </div>
        )}

        {/* Degraded-from-tiers (S59): the DESIGNED degraded state, read pre-derived
            from the stores degradation layer (RECONNECTING on stream loss) — never
            guessed from a transport error. */}
        {timelineChrome.showDegraded && (
          <div
            className={timelineChrome.degradedClassName}
            role="status"
            aria-live="polite"
            data-timeline-degraded
          >
            <span className={timelineChrome.degradedDotClassName} />
            {timelineChrome.degradedLabel}
          </div>
        )}

        {/* Error: a contained, copy-toned message scoped to the timeline. */}
        {timelineChrome.showError && (
          <div
            className={timelineChrome.errorClassName}
            role="alert"
            data-timeline-error
          >
            <span>{timelineChrome.errorLabel}</span>
            <button
              type="button"
              onClick={lineage.retry}
              className={timelineChrome.retryButtonClassName}
            >
              {timelineChrome.retryLabel}
            </button>
          </div>
        )}

        {!loading && !errored && !autoFitPending && (
          <TemporalDocumentCountPill
            visibleDocuments={temporalScene.debug.visibleNodeCount}
            totalDocuments={nodes.length}
          />
        )}

        {overlay}
      </div>

      {/* The range navigator / scrubber: a dedicated band docked at the bottom edge
          (its own row, no longer overlapping the marks) showing the WHOLE corpus
          span with the visible window as a draggable brush — click/drag to scrub. */}
      <div className="shrink-0 bg-paper" data-timeline-scrubber>
        <Minimap viewportWidth={width} overviewInstants={overviewInstants} />
      </div>
    </div>
  );
}
