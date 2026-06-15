// The relational phase-lane timeline (dashboard-timeline ADR "Representation" /
// "Interaction", W03.P06): the corpus's diachronic lineage view. Lanes are the
// framework pipeline phases (research/reference · adr · plan · exec · review ·
// codify); each dated document is a node at its blob-true creation instant in its
// phase lane, drawn at full opacity with its Phosphor domain mark (shape-first,
// 14px grayscale gate, currentColor). The ALWAYS-ON surface is dated marks ONLY —
// no arcs by default. Relations are an ON-DEMAND overlay (see Interaction).
//
// Scroll model: a zoomable pixels-per-time scale + a scroll offset, LIVE docked
// at the right, scrolling left walks back in time; marks are virtualized to the
// visible range plus a margin and held under a belt-and-suspenders client cap, so
// the surface stays bounded at any corpus age.
//
// Interaction (ADR "Interaction"): hovering or selecting a node draws ONLY that
// node's 1-hop derivation arcs (to its neighbors), with the tier-as-treatment
// edge vocabulary (declared solid / structural status-hued / temporal dotted /
// semantic haze, confidence as lightness), and lifts its ego (node + neighbors +
// incident arcs keep full treatment) while the rest DIM — never hide. A single
// focused node's incident set is intrinsically small, so the arcs are drawn raw;
// there is no always-on arc field and so no bundling/disparity hairball machinery.
//
// Layer ownership (dashboard-layer-ownership / ADR "Layer ownership"): this is
// app-chrome. It reads the lineage slice through the stores hook and the
// degradation state through a stores selector, and emits select/hover intent back
// through shared state. It fetches nothing, defines no node/edge shape, reads no
// raw `tiers` block, and re-mints no stable id. The mark silhouettes come from
// the shared domain-mark family (`scene/field/markComponents`) — the same
// presentational SVG source the inspector and legends already consume from chrome.

import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";

import { DocTypeMark } from "../../scene/field/markComponents";
import type { LineageArc, LineageNode } from "../../stores/server/engine";
import { useFiltersVocabulary, useTimelineLineage } from "../../stores/server/queries";
import { useViewStore } from "../../stores/view/viewStore";
import { useElementWidth } from "../chrome/useElementWidth";
import { useSurfaceStates } from "../degradation/useDegradation";
import { useActiveScope } from "../stage/Stage";
// Side-effect import: registers the timeline's event-mark menu resolver at load
// (the contributed-menus model; the resolver module is owned by the
// dashboard-context-menus surface and consumed by the generic menu host).
import "./menus/eventMarkMenu";
import {
  type ArcInput,
  type ArcPoint,
  type ArcState,
  type ResolvedArc,
  arcEndpointLabel,
  incidentResolvedArcs,
} from "./arcs";
import { prefersReducedMotion } from "./RangeSelect";
import {
  PHASE_LANES,
  type PhaseLane,
  laneCenterY,
  laneOf as laneOfNode,
  lanesHeight,
} from "./phaseLanes";
import {
  MAX_TIMELINE_MARKS,
  TIMELINE_ORIGIN_MS,
  capItems,
  clampPxPerMs,
  isInVisibleRange,
  timeToStripX,
  timeToX as timeToStripViewportX,
  visibleRange,
} from "./scrollStrip";

// --- retained legacy lane/zoom/projection helpers (unit-tested) -----------------
//
// W03.P07 retains and adapts the existing transport (playhead, range-select,
// time-travel, event selection) which still consumes these window-form helpers
// and the event-kind lane/mark vocabulary; they are kept here, alongside the new
// scroll-strip + phase-lane model the relational surface renders against.

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

export interface TimeWindow {
  from: number;
  to: number;
}

/** Window-form time->x (retained for the playhead/range-select transport). */
export function timeToX(t: number, window: TimeWindow, width: number): number {
  return ((t - window.from) / (window.to - window.from)) * width;
}

/** Window-form x->time (retained for the transport). */
export function xToTime(x: number, window: TimeWindow, width: number): number {
  return window.from + (x / width) * (window.to - window.from);
}

export const MIN_SPAN_MS = 3600_000;
export const MAX_SPAN_MS = 5 * 365 * 24 * 3600_000;

/** Zoom the window by `factor` anchored at `anchorT`, clamped to `now` (retained). */
export function zoomWindow(
  window: TimeWindow,
  anchorT: number,
  factor: number,
  now: number,
): TimeWindow {
  const span = Math.max(
    MIN_SPAN_MS,
    Math.min(MAX_SPAN_MS, (window.to - window.from) * factor),
  );
  const ratio = (anchorT - window.from) / (window.to - window.from);
  let from = anchorT - span * ratio;
  let to = from + span;
  if (to > now) {
    to = now;
    from = to - span;
  }
  return { from, to };
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
 * The phase lanes the relational timeline draws (dashboard-timeline ADR). The
 * canonical lane list and its type live in `./phaseLanes`; re-exported here so
 * consumers that import the lane vocabulary from this module keep working.
 */
export { PHASE_LANES, type PhaseLane };

/** Default per-lane visibility: every phase lane shown. */
function allLanesVisible(): Record<PhaseLane, boolean> {
  return Object.fromEntries(PHASE_LANES.map((lane) => [lane, true])) as Record<
    PhaseLane,
    boolean
  >;
}

/**
 * The default pixels-per-time scale for the scroll-strip model: ~1.5 days span
 * per 100px keeps a multi-month corpus scrollable at a legible default.
 */
export const DEFAULT_PX_PER_MS = 100 / (1.5 * 24 * 3600_000);

interface TimelineState {
  window: TimeWindow;
  /** The playhead position; "live" docks at the right edge (ADR). */
  playheadT: number | "live";
  setWindow: (window: TimeWindow) => void;
  setPlayhead: (t: number | "live") => void;
  // --- scroll-strip view state (S25, dashboard-timeline ADR) ---
  scrollOffset: number;
  pxPerMs: number;
  setScrollOffset: (scrollOffset: number) => void;
  setPxPerMs: (pxPerMs: number) => void;
  // --- per-lane visibility view state (S26) ---
  laneVisibility: Record<PhaseLane, boolean>;
  toggleLane: (lane: PhaseLane, visible?: boolean) => void;
  // --- hovered-node view state (S27) ---
  hoveredNodeId: string | null;
  setHoveredNode: (hoveredNodeId: string | null) => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  window: { from: Date.now() - 180 * 24 * 3600_000, to: Date.now() },
  playheadT: "live",
  setWindow: (window) => set({ window }),
  setPlayhead: (playheadT) => set({ playheadT }),
  scrollOffset: 0,
  pxPerMs: DEFAULT_PX_PER_MS,
  setScrollOffset: (scrollOffset) => set({ scrollOffset: Math.max(0, scrollOffset) }),
  setPxPerMs: (pxPerMs) => set({ pxPerMs: pxPerMs > 0 ? pxPerMs : DEFAULT_PX_PER_MS }),
  laneVisibility: allLanesVisible(),
  toggleLane: (lane, visible) =>
    set((state) => ({
      laneVisibility: {
        ...state.laneVisibility,
        [lane]: visible ?? !state.laneVisibility[lane],
      },
    })),
  hoveredNodeId: null,
  setHoveredNode: (hoveredNodeId) => set({ hoveredNodeId }),
}));

// --- pure render-prep helpers (unit-testable, no DOM) ----------------------------

const LANE_LABEL_W = 56;
const TOP_PAD = 4;
const MARK_PX = 13;
const RULER_HEIGHT = 16;
/** Virtualization margin (px) so a mark partly off-screen stays drawn. */
const VIRTUAL_MARGIN_PX = 120;
/** The dim alpha a receded (out-of-ego) mark/arc takes — never hidden (S40). */
const RECEDE_ALPHA = 0.22;

/** The instant a node's mark is positioned at (blob-true creation), or null. */
export function nodeInstant(node: LineageNode): number | null {
  const created = node.dates?.created;
  if (!created) return null;
  const t = Date.parse(created);
  return Number.isFinite(t) ? t : null;
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

/**
 * Reactively read the `prefers-reduced-motion` setting (S66). Subscribes to the
 * media-query list so a runtime flip of the OS setting re-renders the surface;
 * the read itself goes through the shared `prefersReducedMotion()` helper so the
 * media-query string is named in exactly one place. SSR/test-safe: falls back to
 * `false` when `matchMedia` is unavailable.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

// --- the component --------------------------------------------------------------------

/** Marks/extensions other steps dock into the timeline surface. */
export interface TimelineSurfaceProps {
  /**
   * Select intent for a lineage mark — emitted up to the shared selection. The
   * surface owns the arc set, so it hands the visible-slice arcs alongside the
   * node; the wired handler (`eventSelection.handleNodeClick`, S45) derives the
   * BOUNDED 1-hop ego join from them for the stage pulse, without the chrome
   * needing to know the lineage shape (dashboard-layer-ownership). The arcs
   * argument is optional so a bare `(node) => void` consumer still type-checks.
   */
  onNodeClick?: (node: LineageNode, arcs: readonly LineageArc[]) => void;
  overlay?: React.ReactNode;
}

export function Timeline({ onNodeClick, overlay }: TimelineSurfaceProps = {}) {
  const scope = useActiveScope();
  const pxPerMs = useTimelineStore((s) => s.pxPerMs);
  const scrollOffset = useTimelineStore((s) => s.scrollOffset);
  const laneVisibility = useTimelineStore((s) => s.laneVisibility);
  const hoveredNodeId = useTimelineStore((s) => s.hoveredNodeId);
  const setHoveredNode = useTimelineStore((s) => s.setHoveredNode);
  const setPxPerMs = useTimelineStore((s) => s.setPxPerMs);
  const setScrollOffset = useTimelineStore((s) => s.setScrollOffset);
  const hostRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(hostRef) ?? 800;

  // Auto-fit the corpus into view on first load and on scope change, so the
  // timeline SHOWS its data by default. The scroll-strip origin is the epoch, so
  // an un-positioned default window (`scrollOffset: 0`) opens decades from the
  // corpus and renders nothing until the user finds fit-all — the "displays
  // nothing regardless of data" defect. The engine-enumerated corpus date bounds
  // (`/filters`, independent of the range-bounded lineage fetch, so no empty-
  // window deadlock) give the span to fit. Runs ONCE per scope: after the initial
  // fit the user's scroll/zoom is respected; a new scope re-fits its own corpus.
  const vocabulary = useFiltersVocabulary(scope);
  const corpusBounds = vocabulary.data?.date_bounds;
  const [fittedScope, setFittedScope] = useState<string | null>(null);
  useEffect(() => {
    if (scope == null || width <= 0) return;
    if (fittedScope === scope) return;
    const fromMs = corpusBounds?.from ? Date.parse(corpusBounds.from) : NaN;
    if (!Number.isFinite(fromMs)) return; // wait for the bounds (or no dated corpus)
    const toRaw = corpusBounds?.to ? Date.parse(corpusBounds.to) : Date.now();
    const toMs = Number.isFinite(toRaw) ? toRaw : Date.now();
    const inset = 24;
    const usable = Math.max(1, width - inset * 2);
    const px = clampPxPerMs(usable / Math.max(1, toMs - fromMs));
    const offset = Math.max(0, timeToStripX(fromMs, TIMELINE_ORIGIN_MS, px) - inset);
    setPxPerMs(px);
    setScrollOffset(offset);
    setFittedScope(scope);
  }, [
    scope,
    corpusBounds?.from,
    corpusBounds?.to,
    width,
    fittedScope,
    setPxPerMs,
    setScrollOffset,
  ]);
  // While the corpus auto-fit is still pending (the vocabulary bounds are loading,
  // or they are known but not yet applied for this scope), the default scroll
  // window has NOT been positioned onto the data. Suppress the "no lineage" empty
  // state during that window so the surface never flashes a false "no data" before
  // the fit lands — show the loading scaffold instead. Once bounds are absent (a
  // genuinely undated corpus) or the fit has applied, the real empty state shows.
  const autoFitPending =
    vocabulary.isLoading || (!!corpusBounds?.from && fittedScope !== scope);

  // Degradation truth, pre-derived from the stores layer (ADR "States"): never
  // read from a transport error, never the raw `tiers` block. The RECONNECTING
  // row (stream loss) is the timeline's designed degraded state — read here, not
  // guessed from a fetch rejection (degradation-is-read-from-tiers-not-guessed-
  // from-errors).
  const surface = useSurfaceStates().timeline;
  const degraded = surface === "reconnecting";

  // Reduced-motion floor (S66, ADR "Accessibility & motion"): under
  // prefers-reduced-motion the ego-highlight ANIMATION swaps for an instant state
  // change. The DOM-transition floor is honoured app-wide by the global CSS rule;
  // this flag swaps the *behavioural* animation (the mark/arc opacity transition)
  // for an instant cut so the surface never tweens for a reduced-motion user. Read
  // reactively so a media-query flip re-renders the surface.
  const reducedMotion = useReducedMotion();

  // The visible time range for the current scroll position (virtualized + margin)
  // bounds the read at any corpus age (graph-queries-are-bounded-by-default).
  const range = useMemo(
    () => visibleRange(scrollOffset, width, pxPerMs, VIRTUAL_MARGIN_PX),
    [scrollOffset, width, pxPerMs],
  );

  // The sole wire read: the bounded lineage slice for the scope + visible range.
  // The playhead drives the stage time-travel ONLY; the timeline marks render the
  // live in-range corpus and do NOT refetch per playhead instant. (The hook keeps
  // its optional `asOf` param as a harmless capability; the UI just never drives
  // it — no debounced per-playhead refetch storm.)
  const lineage = useTimelineLineage(scope, {
    from: new Date(range.fromMs).toISOString(),
    to: new Date(range.toMs).toISOString(),
  });

  const phaseBandH = lanesHeight(TOP_PAD);
  const height = phaseBandH + RULER_HEIGHT;

  const loading = lineage.isLoading;
  const errored = lineage.isError;
  const nodes = useMemo(() => lineage.data?.nodes ?? [], [lineage.data]);
  const arcs = useMemo(() => lineage.data?.arcs ?? [], [lineage.data]);

  // --- visible, in-range, visible-lane marks (virtualized + capped, S34) ---
  const visibleMarks = useMemo(() => {
    const placed = nodes
      .map((node) => {
        const t = nodeInstant(node);
        if (t == null || !isInVisibleRange(t, range)) return null;
        const laneIdx = laneOfNode(node);
        if (laneIdx == null) return null;
        const lane = PHASE_LANES[laneIdx];
        if (!laneVisibility[lane]) return null;
        // Origin = the range start, so x is the in-viewport position directly.
        const x = timeToStripViewportX(t, range.fromMs, pxPerMs, 0);
        const y = laneCenterY(laneIdx, TOP_PAD);
        return { node, x, y };
      })
      .filter((m): m is { node: LineageNode; x: number; y: number } => m !== null);
    return capItems(placed, MAX_TIMELINE_MARKS);
  }, [nodes, range, laneVisibility, pxPerMs]);

  // Endpoint lookup: only the marks that survived virtualization + lane-visibility
  // are positioned, so an arc resolves ONLY when both endpoints are on screen and
  // their lanes are visible (the rule is satisfied structurally by the lookup).
  const positionOf = useMemo(() => {
    const map = new Map<string, ArcPoint>();
    for (const m of visibleMarks.items) map.set(m.node.id, { x: m.x, y: m.y });
    return (id: string): ArcPoint | undefined => map.get(id);
  }, [visibleMarks]);

  // Coerce the wire arcs to the arc-model input (structural state from relation).
  const arcInputs = useMemo<ArcInput[]>(
    () =>
      arcs.map((a) => ({
        id: a.id,
        src: a.src,
        dst: a.dst,
        tier: a.tier,
        confidence: a.confidence,
        derivation: a.derivation,
        relation: a.relation,
        state: structuralStateOf(a.relation),
      })),
    [arcs],
  );

  // --- on-demand relations overlay (the focused node's 1-hop arcs) ----------------
  //
  // The ALWAYS-ON surface is dated marks only — NO arcs by default. Relations are an
  // on-demand overlay: arcs appear ONLY for the FOCUSED node (the hovered mark, or
  // the selected document when nothing is hovered) and are ONLY that node's 1-hop
  // incident set, resolved raw. A single node's incident set is intrinsically small,
  // so there is no whole-corpus arc field to bundle or thin — the always-on hairball
  // is structurally absent.
  const selection = useViewStore((s) => s.selection);
  const selectedNodeId = selection?.kind === "node" ? selection.id : null;
  const focusedNodeId = hoveredNodeId ?? selectedNodeId;

  const renderedArcs: ResolvedArc[] = useMemo(
    () => incidentResolvedArcs(arcInputs, positionOf, focusedNodeId),
    [arcInputs, positionOf, focusedNodeId],
  );

  // Ego-highlight (S40): the focused node (hovered or selected) + its 1-hop
  // neighbors + incident arcs keep full treatment; the rest RECEDE to a dim alpha
  // — never hide. Without a focus the marks all stay at full opacity (the default).
  const ego = useMemo(
    () => egoNodeIds(arcInputs, focusedNodeId),
    [arcInputs, focusedNodeId],
  );
  const hasFocus = focusedNodeId != null;

  // A short human name for a node id, for the arc endpoint announcements (S64):
  // its title when carried, else its doc-type, else the raw id stem.
  const nodeNameOf = useMemo(() => {
    const names = new Map<string, string>();
    for (const node of nodes) {
      names.set(node.id, node.title || node.doc_type || node.id.replace(/^doc:/, ""));
    }
    return (id: string): string => names.get(id) ?? id.replace(/^doc:/, "");
  }, [nodes]);

  // Per-node incident-arc descriptions (S64): each focusable mark announces its
  // incident relations and the endpoint each joins, so an arc's relation is
  // reachable from either endpoint without the arc being its own tab-stop. The
  // descriptions are sentence-cased phrases the mark label appends.
  const incidentDescriptionsOf = useMemo(() => {
    const byNode = new Map<string, string[]>();
    const push = (id: string, phrase: string) => {
      const list = byNode.get(id);
      if (list) list.push(phrase);
      else byNode.set(id, [phrase]);
    };
    for (const arc of arcInputs) {
      push(arc.src, arcEndpointLabel(arc, "src", nodeNameOf));
      push(arc.dst, arcEndpointLabel(arc, "dst", nodeNameOf));
    }
    return byNode;
  }, [arcInputs, nodeNameOf]);

  // Mark transition class (ego-highlight motion): the mark eases its COLOR and
  // OPACITY as the ego-highlight lifts/dims it on focus. Under reduced motion
  // nothing transitions (the app-wide motion floor) — the highlight is an instant
  // cut.
  const markTransitionClass = reducedMotion
    ? ""
    : "transition-[color,opacity] duration-ui-fast ease-settle";

  const noHistory =
    scope != null &&
    !loading &&
    !errored &&
    !autoFitPending &&
    nodes.length === 0 &&
    (surface === "empty" || surface === "normal" || surface === "lifecycle-sparse");

  return (
    <div ref={hostRef} className="relative h-full select-none" data-timeline>
      <svg
        className="h-full w-full"
        role="img"
        aria-label="lineage timeline"
        aria-busy={loading || undefined}
      >
        {PHASE_LANES.map((lane, i) =>
          laneVisibility[lane] ? (
            <g key={lane}>
              <text
                x={4}
                y={laneCenterY(i, TOP_PAD) + 3}
                className="fill-ink-faint text-2xs"
              >
                {lane}
              </text>
              {/* Soft low-contrast lane rule — structure felt, not seen (ADR). */}
              <line
                x1={LANE_LABEL_W}
                x2={width}
                y1={laneCenterY(i, TOP_PAD)}
                y2={laneCenterY(i, TOP_PAD)}
                className="stroke-rule"
              />
            </g>
          ) : null,
        )}

        {/* Derivation arcs (S36/S37): the ON-DEMAND relations overlay, drawn UNDER
            the marks and ONLY for the focused node (hovered or selected) — its 1-hop
            incident set, never an always-on field. Each arc's tier-as-treatment
            descriptor styles the path; the focused ego keeps full treatment while
            non-ego endpoints recede (never hide). The arcs are decorative paint
            (`aria-hidden`): they are REACHABLE through their endpoints (S64), whose
            mark labels announce each incident relation + the joined endpoint, so the
            relation is announced without arcs becoming extra tab-stops. */}
        <g data-timeline-arcs aria-hidden="true">
          {renderedArcs.map((arc) => {
            const inEgo = !hasFocus || ego.has(arc.src) || ego.has(arc.dst);
            const t = arc.treatment;
            const opacity = inEgo ? t.opacity : t.opacity * RECEDE_ALPHA;
            return (
              <path
                key={arc.id}
                d={arc.path}
                fill="none"
                stroke={`var(${t.stroke})`}
                strokeWidth={t.widthPx}
                strokeDasharray={t.dash || undefined}
                strokeLinecap="round"
                opacity={opacity}
                className={
                  reducedMotion
                    ? undefined
                    : "transition-opacity duration-ui-fast ease-settle"
                }
                data-timeline-arc
                data-arc-tier={t.tier}
                data-arc-recede={inEgo ? undefined : "true"}
              >
                <title>{arc.label}</title>
              </path>
            );
          })}
        </g>

        {/* Ruler baseline — a soft token rule, attenuated so the marks lead. */}
        <line
          x1={0}
          x2={width}
          y1={height - RULER_HEIGHT}
          y2={height - RULER_HEIGHT}
          className="stroke-rule-strong"
        />
      </svg>

      {/* Ruler endpoints as HTML so tabular numerals apply (ADR: mandated on
          dates). The visible range's edges, tabular-rendered. */}
      <div
        className="pointer-events-none absolute inset-x-0 flex justify-between px-vs-1 text-2xs text-ink-faint"
        style={{ bottom: "2px" }}
      >
        <time data-tabular dateTime={new Date(range.fromMs).toISOString()}>
          {new Date(range.fromMs).toISOString().slice(0, 10)}
        </time>
        <time data-tabular dateTime={new Date(range.toMs).toISOString()}>
          {new Date(range.toMs).toISOString().slice(0, 10)}
        </time>
      </div>

      {/* Dated document marks (S34): a focusable HTML overlay so the Phosphor
          domain mark renders in-family AND each mark is a keyboard-reachable
          control with its kind / date / lineage degree announced (ADR a11y).
          Ego-highlight (S40): the hovered node + 1-hop neighbors keep full
          treatment, the rest recede (never hide). Belt-and-suspenders cap. */}
      {!loading && !errored && visibleMarks.items.length > 0 && (
        <div
          className="pointer-events-none absolute inset-0"
          role="group"
          aria-label="lineage marks"
        >
          {visibleMarks.items.map(({ node, x, y }) => {
            const inEgo = !hasFocus || ego.has(node.id);
            // Marks render at FULL opacity always — the always-on legible default.
            // The only opacity treatment is the ego-highlight: when a node is
            // focused (hovered/selected) the non-ego marks recede to a dim alpha
            // (never hide); without a focus every mark is full.
            const markOpacity = inEgo ? 1 : RECEDE_ALPHA;
            const created = node.dates?.created;
            // S63: the mark announces its kind, date, joined-node count, and
            // lineage degree. The joined-node count is the distinct 1-hop
            // neighbour count (computed from the arcs); the lineage degree is the
            // engine's total-degree salience input.
            const joined = joinedNodeCount(arcInputs, node.id);
            const base = `${node.doc_type}${node.title ? ` ${node.title}` : ""} at ${
              created ? humanInstant(created) : "unknown date"
            }, ${joined} joined node${joined === 1 ? "" : "s"}, lineage degree ${
              node.degree
            }`;
            // S64: append the incident-relation phrases so each arc's relation +
            // endpoints are announced from this endpoint (arcs are not tab-stops).
            const incident = incidentDescriptionsOf.get(node.id) ?? [];
            const label =
              incident.length > 0 ? `${base}. ${incident.join("; ")}` : base;
            return (
              <button
                key={node.id}
                type="button"
                aria-label={label}
                title={label}
                onClick={() => onNodeClick?.(node, arcs)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onFocus={() => setHoveredNode(node.id)}
                onBlur={() => setHoveredNode(null)}
                className={`pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-vs-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${markTransitionClass}`}
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  opacity: markOpacity,
                }}
                data-timeline-mark
                data-doc-type={node.doc_type}
                data-mark-recede={inEgo ? undefined : "true"}
              >
                <DocTypeMark kind={node.doc_type} size={MARK_PX} />
              </button>
            );
          })}
        </div>
      )}

      {/* Loading / positioning: a quiet copy-toned liveness line — the lane
          scaffold above stays visible, so the surface never flashes empty (ADR
          "States"). Also shown while the corpus auto-fit is pending, so the
          surface reads as "positioning" rather than a false "no lineage". */}
      {(loading || autoFitPending) && (
        <div
          className="pointer-events-none absolute left-vs-2 top-1/2 flex -translate-y-1/2 items-center gap-vs-1 text-2xs text-ink-faint"
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
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xs text-ink-faint"
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
          guessed from a transport error. The lane scaffold + any cached marks
          stay visible behind it; this is a quiet status badge, not an error and
          not a blanked surface. A live status region announces the transition. */}
      {degraded && !errored && (
        <div
          className="pointer-events-none absolute top-vs-1 right-vs-2 flex items-center gap-vs-1 rounded-full bg-paper-raised/95 px-vs-1-5 py-vs-0-5 text-2xs text-state-stale shadow-card"
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
          className="absolute left-vs-2 top-1/2 flex -translate-y-1/2 items-center gap-vs-2 text-2xs text-ink-muted"
          role="alert"
          data-timeline-error
        >
          <span>couldn’t load the timeline</span>
          <button
            type="button"
            onClick={() => void lineage.refetch()}
            className="rounded-vs-sm bg-paper-sunken px-vs-1-5 py-vs-0-5 text-ink transition-colors duration-ui-fast ease-settle hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            retry
          </button>
        </div>
      )}

      {overlay}
    </div>
  );
}
