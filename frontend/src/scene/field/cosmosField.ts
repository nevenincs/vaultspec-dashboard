// cosmos.gl-backed scene field — node-graph-rework ADR (D1/D2/D3).
//
// Cosmos owns WebGL point/link drawing. The scene uploads deterministic graph data
// on topology changes and renders on demand; Cosmos' GPU force solver and native
// hover picking are deliberately disabled because they perform full-space quadtree
// work and GPU->CPU readbacks that dominate small corpora.
//
// The canvas is FREE and CENTRED by default (soft center-gravity, no hard clip).
// NOTE: with enableSimulation:true, cosmos's per-tick position shader DOES clamp
// every point to [0, spaceSize] (clamp(pointPosition.{r,g}, 0, spaceSize)), so the
// effective world is the SPACE_SIZE box. Seeds are laid out around SPACE_CENTRE
// well inside that box, and cosmos may shrink the effective spaceSize to the WebGL
// max texture size on weaker GPUs (Store.adjustSpaceSize) — keep seed radii modest
// so the field never starts pinned against the wall.
//
// Implements the frozen SceneFieldRenderer seam (mount/resize/destroy/command);
// the SceneController, every chrome surface, and the wire shape are unchanged.

import { Graph } from "@cosmos.gl/graph";

import type {
  EdgeRenderParams,
  SceneAnchor,
  SceneCommand,
  SceneController,
  SceneDelta,
  SceneEdgeData,
  SceneFeatureFlags,
  SceneFieldRenderer,
  SceneNodeData,
} from "../sceneController";
import { DEFAULT_SCENE_FEATURE_FLAGS, EDGE_RENDER_DEFAULTS } from "../sceneController";
import { categoryColor } from "./categoryColor";
import {
  COSMOS_SIMULATION_DEFAULTS,
  cosmosGraphConfig,
  type CosmosSimulationConfig,
} from "./cosmosConfig";
import {
  DEFAULT_REPRESENTATION_MODE,
  representationLayout,
  type RepresentationMode,
} from "./representationLayout";
import { SALIENCE_RADIUS_MAX } from "./nodeAppearance";
import { cssColorNumber } from "./tokenReads";

type CosmosD3Selection = {
  on: (type: string, listener: null | ((event: unknown) => void)) => CosmosD3Selection;
};

/** The ONLY cosmos internal we reach for: stopFrames() halts the perpetual rAF
 *  render loop so the GPU truly idles. There is no public equivalent —
 *  start/pause/unpause only flip the simulation flag; only render() (re)starts
 *  frames and only stopFrames()/destroy() halt them. Everything else uses the
 *  public Graph API. */
type CosmosRuntimeGraph = {
  stopFrames?: () => void;
  renderFrame?: (timestamp?: number) => void;
  findHoveredItem?: () => void;
  _isMouseOnCanvas?: boolean;
  canvas?: HTMLCanvasElement;
  canvasD3Selection?: CosmosD3Selection;
  zoomInstance?: {
    eventTransform?: { k: number };
    isRunning?: boolean;
    convertSpaceToScreenPosition?: (position: [number, number]) => [number, number];
  };
  setZoomTransformByPointPositions?: (
    positions: number[],
    duration?: number,
    scale?: number,
    padding?: number,
  ) => void;
};

/** Cosmos world-space size: sizes the position texture and screen mapping. */
const SPACE_SIZE = 4096;
const SPACE_CENTRE = SPACE_SIZE / 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Fallback node diameter when no per-node radius is known (auto-sizing a bound). */
const FALLBACK_DIAMETER = 68;
const COSMOS_POINT_SIZE = 4;
// Emphasis dimming is driven by cosmos's NATIVE greyout (one mechanism for both
// hover and selection): the active emphasis set is fed to selectPointsByIndices and
// cosmos's shader dims everything else to these opacities. A point/link outside the
// set recedes; a link incident to the set stays lit (cosmos greys links with no
// selected endpoint). No per-frame colour-buffer mutation or re-upload.
const GREYOUT_POINT_OPACITY = 0.18;
const GREYOUT_LINK_OPACITY = 0.04;
const COSMOS_GPU_SIMULATION_ENABLED = true;
const PICK_RADIUS_PX = 14;
const ONE_SHOT_IDLE_DELAY_MS = 48;
const RENDERER_PRIMING_MIN_FRAMES = 8;
const RENDERER_PRIMING_MIN_MS = 350;
const RENDERER_PRIMING_MAX_MS = 1200;

/** Configurable canvas/sim containment (node-graph-rework ADR D3). `size` is the
 *  radius (circle) or half-extent (rect) in world units; 0 means auto-fit so the
 *  static layout is non-overlapping for the node count. `free` is unbounded. */
export type BoundShape = "free" | "circle" | "rect";
export interface FieldBounds {
  shape: BoundShape;
  size: number;
}
type RendererLifecycle =
  | "empty"
  | "uploading"
  | "priming"
  | "simulation-pending"
  | "simulating"
  | "ready"
  | "static-ready";
type SimulationStartKind = "cold" | "warm" | "param" | "pin" | "interaction";
interface RendererLifecycleTraceEntry {
  seq: number;
  phase: RendererLifecycle;
  reason: string;
  ageMs: number;
  pointCount: number;
  alpha: number;
  running: boolean;
  pending: SimulationStartKind | null;
}

// Default to a FREE canvas centred by soft gravity - the knowledge-graph norm
// (Obsidian/Logseq/Foam/Roam/force-graph): no hard bound, overlap-tolerant. The
// circle/rect options remain as a SOFT compactness preset, not a hard clamp.
const DEFAULT_BOUNDS: FieldBounds = { shape: "free", size: 0 };

/** Soft center-gravity strength (forceX/forceY) per bound shape - the norm's way
 *  of "centering" and shaping compactness, NOT a hard clip. free = loose sprawl,
 *  circle = tight round blob (Obsidian's "center force"), rect = medium. */
const CENTER_STRENGTH: Record<BoundShape, number> = {
  free: COSMOS_SIMULATION_DEFAULTS.simulationGravity,
  circle: 0.35,
  rect: 0.3,
};

/** Resolve the soft center-gravity strength from a bound shape + optional size.
 *  size 0 = the shape preset; size>0 makes the size slider a live compactness knob
 *  (smaller = tighter / stronger gravity), so it is never a dead control. */
function centerStrength(shape: BoundShape, size: number): number {
  if (size > 0) {
    const s = Math.max(300, Math.min(4000, size));
    return 0.13 - (0.11 * (s - 300)) / (4000 - 300); // tight 0.13 .. loose 0.02
  }
  return CENTER_STRENGTH[shape];
}

/** Auto disc radius that keeps a sunflower-packed disc of `count` nodes of max
 *  diameter `d` non-overlapping: spacing ~= R*sqrt(pi/count) >= d, so
 *  R >= d*sqrt(count/pi); the 1.12 factor is headroom against the approximation. */
function autoDiscRadius(count: number, d: number): number {
  if (count <= 1) return d;
  return d * Math.sqrt(count / Math.PI) * 1.12;
}

function cosmosPointSize(node: SceneNodeData): number {
  if (typeof node.salience === "number") {
    const s = Math.max(0, Math.min(1, node.salience));
    return COSMOS_POINT_SIZE * (1 + s * (SALIENCE_RADIUS_MAX - 1));
  }
  if (node.kind === "feature" && node.memberCount && node.memberCount > 0) {
    return COSMOS_POINT_SIZE * (1.4 + Math.log2(1 + node.memberCount) * 0.5);
  }
  return COSMOS_POINT_SIZE;
}

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

/** Shared empty selection set (avoids per-call allocation in the disabled path). */
const EMPTY_ID_SET: ReadonlySet<string> = new Set<string>();

/** Membership equality for two id sets (selection-emphasis-005 no-op guard). */
function sameIdSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/** Hex int (0xRRGGBB) -> cosmos [r,g,b,a] floats in [0,1]. */
function rgba(hex: number): [number, number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, 1];
}

/** Scene token (literal hex int) -> "#rrggbb" string for cosmos string colours. */
function hexString(varName: string, fallback: number): string {
  return `#${cssColorNumber(varName, fallback).toString(16).padStart(6, "0")}`;
}

/**
 * World position for a stable phyllotaxis SLOT inside the bound, written into
 * `out` at point index `i`, non-overlapping BY CONSTRUCTION. Keying placement on a
 * per-id slot (not the array index) is the Tier-2 no-bounce retention: a surviving
 * node keeps its slot - and, because the capacity and radius are stable, its
 * position - across a refetch/add/remove. free (default) and circle are sunflower
 * spirals (free grows unbounded; circle caps the radius to fill a disc); rect is a
 * retained compatibility mode, not a default.
 */
function slotPosition(
  out: Float32Array,
  i: number,
  slot: number,
  bounds: FieldBounds,
  capacity: number,
  maxDiameter: number,
): void {
  const d = maxDiameter > 0 ? maxDiameter : FALLBACK_DIAMETER;
  const cap = Math.max(1, capacity);
  if (bounds.shape === "rect") {
    const half = bounds.size > 0 ? bounds.size : autoDiscRadius(cap, d) * 0.886;
    const cols = Math.max(1, Math.ceil(Math.sqrt(cap)));
    const step = (half * 2) / cols;
    out[i * 2] = SPACE_CENTRE - half + ((slot % cols) + 0.5) * step;
    out[i * 2 + 1] = SPACE_CENTRE - half + (Math.floor(slot / cols) + 0.5) * step;
    return;
  }
  if (bounds.shape === "free") {
    // Sunflower spiral, but the radius is capped inside the [0, SPACE_SIZE] box:
    // with the GPU sim on, cosmos clamps every point to that box per tick, so a
    // seed past the wall would start pinned to the edge. The cap only affects the
    // initial seed of very large graphs (repulsion spreads them after).
    const r = Math.min(d * Math.sqrt(slot), SPACE_CENTRE * 0.95);
    const a = slot * GOLDEN_ANGLE;
    out[i * 2] = SPACE_CENTRE + Math.cos(a) * r;
    out[i * 2 + 1] = SPACE_CENTRE + Math.sin(a) * r;
    return;
  }
  const R = bounds.size > 0 ? bounds.size : autoDiscRadius(cap, d);
  const r = R * Math.sqrt((slot + 0.5) / cap);
  const a = slot * GOLDEN_ANGLE;
  out[i * 2] = SPACE_CENTRE + Math.cos(a) * r;
  out[i * 2 + 1] = SPACE_CENTRE + Math.sin(a) * r;
}

/**
 * Cheap content signature for the Tier-2 dedup guard: node count, edge count, and
 * an FNV-1a hash over node ids + edge endpoints. An identical refetch hashes
 * identically and is skipped wholesale, so it cannot re-upload, re-place, or bounce.
 *
 * Node ids are hashed char-by-char ONCE (in the node pass); edges then hash the
 * INTERNED integer index of each endpoint rather than walking the endpoint strings
 * again. At tens of thousands of edges with long vault ids this turns an
 * O(sum of all edge-endpoint string lengths) pass into O(edges) integer folds — the
 * dominant cost of the dedup that often decides to do nothing.
 *
 * APPEARANCE is part of the signature (signature-006): the upload writes point
 * colours/sizes and per-link colour/width from docType/kind, salience/memberCount,
 * feature tags, and edge tier/confidence/state. Keying on topology alone would
 * short-circuit an appearance-only change (e.g. a status/tier flip with unchanged
 * ids), leaving stale GPU buffers. So the signature folds those inputs too.
 */
function contentSignature(
  nodes: readonly SceneNodeData[],
  edges: readonly SceneEdgeData[],
): string {
  let h = 0x811c9dc5;
  const mix = (s: string): void => {
    for (let k = 0; k < s.length; k++) {
      h ^= s.charCodeAt(k);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2c;
    h = Math.imul(h, 0x01000193);
  };
  const mixInt = (n: number): void => {
    h ^= n & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (n >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (n >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (n >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  const idIndex = new Map<string, number>();
  let next = 0;
  for (const n of nodes) {
    idIndex.set(n.id, next++);
    mix(n.id);
    // Appearance inputs (signature-006): colour (docType/kind), size
    // (salience/memberCount), and the hover cohort (feature tags). An
    // appearance-only change must re-upload, so it must change the signature.
    mix(n.docType ?? n.kind);
    mixInt(Math.round((n.salience ?? -1) * 1000));
    mixInt(n.memberCount ?? -1);
    if (n.featureTags && n.featureTags.length) mix(n.featureTags.join(","));
  }
  for (const n of nodes) {
    if (n.seedPosition) {
      mix(
        `${Math.round(n.seedPosition.x * 100) / 100}:${Math.round(n.seedPosition.y * 100) / 100}`,
      );
    }
  }
  for (const e of edges) {
    // Edge id is identity-bearing for linkEdgeIds and visibility masks. Two edges
    // can share endpoints while carrying different ids; skipping the id leaves the
    // uploaded edge-id mirror stale after an otherwise appearance-identical update.
    mix(e.id);
    mixInt(idIndex.get(e.src) ?? -1);
    mixInt(idIndex.get(e.dst) ?? -1);
    // Edge appearance (signature-006): tier → colour, confidence → width/opacity,
    // state → dimming. Bucket confidence so float jitter does not thrash uploads.
    mix(`${e.tier}:${e.state ?? ""}`);
    mixInt(Math.round((e.confidence ?? 1) * 100));
  }
  return `${nodes.length}:${edges.length}:${(h >>> 0).toString(16)}`;
}

/** Hard upload/sim ceiling for edges fed to cosmos (bounded-by-default). cosmos
 *  couples the rendered and simulated link sets through setLinks, so this caps
 *  both. Set well above current corpus scale (~37k) so it is a SAFETY CEILING that
 *  bounds a pathological slice rather than altering today's graphs; lower it only
 *  if a measured large-graph settle on real hardware shows the force tick is the
 *  bottleneck (the audit's edge-LOD follow-up). */
const EDGE_SIM_CAP = 50000;

/** The high-precision layout backbone — always kept when thinning. */
const BACKBONE_TIERS = new Set(["declared", "structural"]);

/**
 * Bound the edge set to `cap` for upload to cosmos. The declared/structural
 * backbone is always kept; if the total still exceeds the cap, the noisy tiers are
 * kept by descending confidence until the budget is full. Returns the kept subset
 * (original order preserved) and the count dropped by LOD, surfaced honestly via
 * debugSnapshot — never silently zeroed.
 */
export function boundEdgesForSim(
  edges: readonly SceneEdgeData[],
  cap: number,
): { kept: readonly SceneEdgeData[]; lodDropped: number } {
  if (edges.length <= cap) return { kept: edges, lodDropped: 0 };
  const keep = new Set<number>();
  const noisy: number[] = [];
  for (let i = 0; i < edges.length; i++) {
    if (BACKBONE_TIERS.has(edges[i].tier)) keep.add(i);
    else noisy.push(i);
  }
  const budget = cap - keep.size;
  if (budget > 0) {
    noisy.sort((a, b) => (edges[b].confidence ?? 0) - (edges[a].confidence ?? 0));
    for (let k = 0; k < noisy.length && k < budget; k++) keep.add(noisy[k]);
  }
  const kept: SceneEdgeData[] = [];
  for (let i = 0; i < edges.length; i++) if (keep.has(i)) kept.push(edges[i]);
  return { kept, lodDropped: edges.length - kept.length };
}

// --- Tier-3 edge encoding (node-graph-rework ADR D4) -------------------------
// Edges encode meaning through colour (tier), width + opacity (confidence) and
// dimming (state). A low base opacity keeps the dense mesh a subtle haze so nodes
// stay readable; a hovered/selected node's incident edges read clearly via the low
// link greyout. This deliberately re-introduces tier colour on the canvas (the
// binding Figma redesign had retired it to flat grey) per the ADR D4 accepted
// divergence, because the user requires edges to carry semantic meaning.
const EDGE_ALPHA_MIN = 0.1;
const EDGE_ALPHA_MAX = 0.5;
const EDGE_WIDTH_MIN = 0.6;
const EDGE_WIDTH_MAX = 2.2;

interface EdgeAppearance {
  r: number;
  g: number;
  b: number;
  a: number;
  width: number;
}

interface PointSizeStats {
  min: number;
  max: number;
  avg: number;
  effectiveMin: number;
  effectiveMax: number;
  effectiveAvg: number;
  linkDistanceToEffectiveAvg: number;
}

interface HoverPickCache {
  id: string;
  screenX: number;
  screenY: number;
  radiusPx: number;
  zoomScale: number;
}

/** Per-link colour/width/opacity for an edge: tier -> hue, confidence -> width +
 *  opacity, broken/stale state -> dimming. `tierColors` is keyed by tier name with
 *  a `rule` fallback for an unknown tier (dimmed, never silently re-bucketed). */
function edgeAppearance(
  edge: SceneEdgeData,
  tierColors: Record<string, [number, number, number, number]>,
): EdgeAppearance {
  const base = tierColors[edge.tier] ?? tierColors.rule;
  const conf =
    typeof edge.confidence === "number" ? Math.max(0, Math.min(1, edge.confidence)) : 1;
  let a = EDGE_ALPHA_MIN + (EDGE_ALPHA_MAX - EDGE_ALPHA_MIN) * conf;
  if (!tierColors[edge.tier]) a *= 0.6; // unknown tier: dim, surfaced via fallback
  if (edge.state === "broken") a *= 0.55;
  else if (edge.state === "stale") a *= 0.78;
  const width = EDGE_WIDTH_MIN + (EDGE_WIDTH_MAX - EDGE_WIDTH_MIN) * conf;
  return { r: base[0], g: base[1], b: base[2], a, width };
}

export class CosmosField implements SceneFieldRenderer {
  private graph: Graph | null = null;
  private container: HTMLDivElement | null = null;
  /** Stable id <-> cosmos point-index mapping (cosmos addresses points by index). */
  private idToIndex = new Map<string, number>();
  private indexToId: string[] = [];
  /** Active containment (node-graph-rework ADR D3); default free/unbounded. */
  private bounds: FieldBounds = { ...DEFAULT_BOUNDS };
  /** Stable per-id phyllotaxis SLOT (Tier-2 retention): a surviving node keeps its
   *  slot - and therefore its position - across a refetch/add/remove, so the field
   *  never bounces. Freed slots are reused; capacity only grows so the radius (and
   *  every kept slot's position) stays stable. */
  private slotById = new Map<string, number>();
  private freeSlots: number[] = [];
  private nextSlot = 0;
  private capacity = 1;
  /** Content signature of the last set-data (Tier-2 dedup): an identical refetch is
   *  skipped wholesale - no re-upload, no re-place, no re-fit, no bounce. */
  private lastSignature = "";
  /** Fit guard (Tier-2): frame the field on first data and after a bound change,
   *  not on every refetch (retention keeps the bbox stable, so re-fitting would
   *  only jitter the camera). */
  private fitPending = true;
  private openingFitTimer: number | null = null;
  /** Edges dropped because an endpoint is not in the current slice (Tier-3 honest
   *  hidden-edge accounting): surfaced via debugSnapshot, never silently zeroed. */
  private droppedEdges = 0;
  /** Edges dropped by the bounded-by-default sim ceiling (EDGE_SIM_CAP), separate
   *  from cross-boundary drops; surfaced via debugSnapshot, never silently zeroed. */
  private lodDroppedEdges = 0;
  private selectedIds = new Set<string>();
  private hoveredId: string | null = null;
  private hoverEmphasisIds = new Set<string>();
  /** Renderer-local pointer cache. This avoids re-projecting every node on high
   *  frequency pointermove when the cursor is still inside the current hit circle. */
  private hoverPickCache: HoverPickCache | null = null;
  private basePointColors = new Float32Array();
  private baseLinkColors = new Float32Array();
  /** Base point sizes / link widths before any visibility mask, so set-visibility
   *  can hide (size/width → 0) and restore without losing the salience/confidence
   *  sizing. Retained per upload alongside the colour buffers. */
  private baseSizes = new Float32Array();
  private baseLinkWidths = new Float32Array();
  /** CPU mirror of the LAST UPLOADED point positions (the seed/static layout, not
   *  the live-settled GPU positions). The source for a representation-mode change's
   *  base array, so mode switches NEVER do a `getPointPositions()` GPU→CPU readback
   *  (a pipeline stall; the layout compute must not leave the GPU). */
  private lastPositions = new Float32Array();
  private linkEndpointIds: [string, string][] = [];
  /** Edge id per uploaded link (parallel to linkEndpointIds) so set-visibility can
   *  hide a link by its edge id, matching the membership the stores layer sends. */
  private linkEdgeIds: string[] = [];
  /** Retained visibility membership (set-visibility): null = everything visible.
   *  Re-applied after a set-data upload so a filter survives a keyframe. */
  private visibleNodeIds: ReadonlySet<string> | null = null;
  private visibleEdgeIds: ReadonlySet<string> | null = null;
  /** Transient pulse cohort (pulse): highest emphasis precedence for a brief flash,
   *  then cleared back to the hover/selection emphasis. */
  private pulseIds = new Set<string>();
  private pulseTimer: number | null = null;
  /** Toggleable interaction layers (set-feature-flags): strip back to bare
   *  nodes+edges+sim by disabling hover/selection/cluster-highlight. Default all on. */
  private featureFlags: SceneFeatureFlags = { ...DEFAULT_SCENE_FEATURE_FLAGS };
  /** feature-tag -> node ids, built once per set-data so the hover cohort is a
   *  union over the hovered node's tags (O(cohort)) instead of a full O(nodes)
   *  re-scan with per-node tag allocation on every hover. */
  private tagToNodeIds = new Map<string, Set<string>>();
  private pointSizeStats: Omit<
    PointSizeStats,
    "effectiveMin" | "effectiveMax" | "effectiveAvg" | "linkDistanceToEffectiveAvg"
  > = {
    min: 0,
    max: 0,
    avg: 0,
  };
  /** Renderer edge controls surfaced through the graph lab/debug seam. */
  private edgeRenderParams: EdgeRenderParams = { ...EDGE_RENDER_DEFAULTS };
  private cosmosConfig: CosmosSimulationConfig = { ...COSMOS_SIMULATION_DEFAULTS };
  private simulationRequested = false;
  private simulationStarted = false;
  private frozen = false;
  private interacting = false;
  private lastAlpha = 0;
  /** Render-on-demand idle (node-graph-rework norm: idle GPU = 0). cosmos's frame
   *  loop renders every frame forever once started; we halt it (stopFrames) after
   *  one-shot paints. Hover is app-owned bounded picking, so pointer presence no
   *  longer keeps Cosmos' frame loop alive. */
  private renderLoopIdle = false;
  private idleTimer: number | null = null;
  private oneShotStopRaf: number | null = null;
  private pointerHandlers: {
    enter: (event: PointerEvent) => void;
    move: (event: PointerEvent) => void;
    wheel: () => void;
    leave: () => void;
    click: (event: MouseEvent) => void;
    dblclick: (event: MouseEvent) => void;
    contextmenu: (event: MouseEvent) => void;
  } | null = null;
  private rendererLifecycle: RendererLifecycle = "empty";
  private rendererLifecycleSeq = 0;
  private rendererLifecycleChangedAt = nowMs();
  private rendererLifecycleTrace: RendererLifecycleTraceEntry[] = [];
  private pendingSimulationStart: SimulationStartKind | null = null;
  private currentNodes: readonly SceneNodeData[] = [];
  private currentEdges: readonly SceneEdgeData[] = [];
  private representationMode: RepresentationMode = DEFAULT_REPRESENTATION_MODE;
  private appliedRepresentationMode: RepresentationMode = DEFAULT_REPRESENTATION_MODE;
  private staticLayoutActive = false;
  private primingRaf1: number | null = null;
  private primingRaf2: number | null = null;
  private primingStartedAt = 0;
  private primingFrameCount = 0;
  /** True once the renderer has been primed (warmed up) at least once this mount.
   *  The first cold load pays the RAF warmup; subsequent content deltas skip it and
   *  reheat GENTLY (changeStartAlpha) so a live delta does not re-cold-start (0.75)
   *  and re-settle the whole graph — the reheat-storm that made live data unstable. */
  private rendererPrimed = false;
  /** Set by createDashboardScene; seam events (select/hover) flow back through it. */
  controller: SceneController | null = null;

  mount(host: HTMLElement): void {
    if (typeof document === "undefined") return; // SSR / node test env
    if (this.graph) return; // idempotent
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.inset = "0";
    container.style.width = "100%";
    container.style.height = "100%";
    host.appendChild(container);
    this.container = container;

    this.graph = new Graph(container, {
      backgroundColor: hexString("--color-canvas-bg", 0xfdfaf6),
      spaceSize: SPACE_SIZE,
      enableSimulation: COSMOS_GPU_SIMULATION_ENABLED,
      rescalePositions: false,
      ...this.cosmosForceConfig(),
      // ---- interaction (live) ---------------------------------------------
      // Node dragging ON: the field is interactive. Canvas pan/zoom is cosmos's
      // own d3-zoom (default enabled); both only render while the frame loop is
      // alive — see maybeIdle, which keeps the loop running continuously while
      // there is data so pan/zoom/drag are never frozen by render-on-demand idle.
      enableDrag: true,
      // Manual fitView() calls pass their own duration/padding; fitViewOnInit is
      // off, so the fitView*-on-init config knobs would be dead and are omitted.
      fitViewOnInit: false,
      enableSimulationDuringZoom: true,
      // Node sizes are WORLD-relative (scale with zoom): a fixed pixel size piles
      // big dots on top of each other when a spread field is zoomed out to fit.
      scalePointsOnZoom: true,
      renderHoveredPointRing: true,
      hoveredPointRingColor: hexString("--color-accent", 0x8a7d5a),
      // ---- edges: tier-encoded connection mesh (node-graph-rework ADR D4) --
      // Per-link colour (tier), width/opacity (confidence) and state dimming are
      // set in setData; these are the base config. A LOW base opacity keeps the
      // dense (~36k-edge) mesh a subtle haze so nodes stay readable; the low
      // greyout makes a hovered/selected node's incident edges read clearly against
      // the rest; the widened visibility-distance range stops edges vanishing on
      // zoom (the [50,150]px default fades most edges out at our scales).
      linkDefaultColor: hexString("--color-scene-rule", 0xd8d2ca), // fallback pre per-link
      linkDefaultWidth: 1,
      linkWidthScale: 1,
      linkDefaultArrows: false,
      renderLinks: true,
      // Native greyout opacities — the single dimming mechanism for hover AND
      // selection (see applyEmphasis). When an emphasis set is active, cosmos dims
      // every point/link outside it to these values on the GPU.
      pointGreyoutOpacity: GREYOUT_POINT_OPACITY,
      linkGreyoutOpacity: GREYOUT_LINK_OPACITY,
      linkVisibilityDistanceRange: [5, 6000],
      hoveredLinkColor: hexString("--color-accent", 0x8a7d5a),
      focusedPointRingColor: hexString("--color-accent", 0x8a7d5a),
      onZoom: () => {
        this.clearHoverPickCache();
        this.emitTrackedAnchors();
      },
      onZoomEnd: () => {
        this.clearHoverPickCache();
        this.emitTrackedAnchors();
      },
      onDragStart: () => this.beginCosmosInteraction(),
      onDragEnd: () => {
        this.endCosmosInteraction();
      },
      onSimulationTick: (alpha) => {
        this.lastAlpha = alpha;
      },
      onSimulationEnd: () => {
        this.lastAlpha = 0;
        this.simulationStarted = false;
        if (this.rendererLifecycle === "simulating") {
          this.setRendererLifecycle("ready", "simulation-end");
        }
        // Settled: let the GPU idle once the pointer is also away.
        this.scheduleIdle();
      },
    });
    this.disableNativeHoverReadback();

    // Render-on-demand idle: pointer movement performs bounded CPU picking from
    // the uploaded position mirror, then paints exactly one Cosmos frame.
    const enter = (event: PointerEvent): void => {
      this.updatePointerHover(event);
    };
    const move = (event: PointerEvent): void => {
      this.updatePointerHover(event);
    };
    const leave = (): void => {
      if (this.hoveredId !== null) {
        this.clearHoverPickCache();
        this.setHoverEmphasis(null);
        this.controller?.emit({ kind: "hover", id: null });
      }
      this.scheduleIdle(ONE_SHOT_IDLE_DELAY_MS);
    };
    const wheel = (): void => {
      this.renderField(0);
      this.scheduleIdle();
    };
    const click = (event: MouseEvent): void => {
      event.stopPropagation();
      const id = this.pickNodeFromEvent(event);
      this.controller?.emit({ kind: "select", id });
    };
    const dblclick = (event: MouseEvent): void => {
      event.stopPropagation();
      const id = this.pickNodeFromEvent(event);
      if (id) this.controller?.emit({ kind: "open", id });
    };
    const contextmenu = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      this.controller?.emit({
        kind: "context-menu",
        id: this.pickNodeFromEvent(event),
        target: "node",
        clientX: event.clientX,
        clientY: event.clientY,
      });
    };
    container.addEventListener("pointerenter", enter);
    container.addEventListener("pointermove", move);
    container.addEventListener("wheel", wheel, { passive: true });
    container.addEventListener("pointerleave", leave);
    container.addEventListener("click", click, true);
    container.addEventListener("dblclick", dblclick, true);
    container.addEventListener("contextmenu", contextmenu, true);
    this.pointerHandlers = { enter, move, wheel, leave, click, dblclick, contextmenu };
  }

  refreshAnchors(): void {
    this.emitTrackedAnchors();
  }

  private disableNativeHoverReadback(): void {
    const runtime = this.graphRuntime();
    if (!runtime) return;
    runtime.findHoveredItem = () => undefined;
    runtime._isMouseOnCanvas = false;
    runtime.canvasD3Selection
      ?.on("mouseenter.cosmos", null)
      ?.on("mousemove.cosmos", null)
      ?.on("mouseleave.cosmos", null)
      ?.on("mousemove", null)
      ?.on("click", null)
      ?.on("contextmenu", null);
  }

  private screenPointFromEvent(event: MouseEvent): [number, number] | null {
    const canvas = this.graphRuntime()?.canvas;
    const target = canvas ?? this.container;
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  private worldToScreen(world: [number, number]): [number, number] | null {
    const zoom = this.graphRuntime()?.zoomInstance;
    const fn = zoom?.convertSpaceToScreenPosition;
    return typeof fn === "function" ? fn.call(zoom, world) : null;
  }

  private zoomScale(): number {
    const k = this.graphRuntime()?.zoomInstance?.eventTransform?.k;
    return typeof k === "number" && Number.isFinite(k) ? k : 1;
  }

  private pickNodeFromEvent(event: MouseEvent): string | null {
    const screen = this.screenPointFromEvent(event);
    if (!screen) return null;
    return this.pickNodeAtScreen(screen[0], screen[1]);
  }

  private clearHoverPickCache(): void {
    this.hoverPickCache = null;
  }

  private cachedHoverHit(screenX: number, screenY: number): string | null {
    const cache = this.hoverPickCache;
    if (!cache || cache.id !== this.hoveredId) return null;
    if (this.visibleNodeIds && !this.visibleNodeIds.has(cache.id)) return null;
    if (Math.abs(cache.zoomScale - this.zoomScale()) > 0.0001) return null;
    const dx = cache.screenX - screenX;
    const dy = cache.screenY - screenY;
    return dx * dx + dy * dy <= cache.radiusPx * cache.radiusPx ? cache.id : null;
  }

  private pickNodeAtScreen(screenX: number, screenY: number): string | null {
    if (this.lastPositions.length !== this.indexToId.length * 2) return null;
    const zoom = this.graphRuntime()?.zoomInstance;
    const toScreen = zoom?.convertSpaceToScreenPosition;
    if (!zoom || typeof toScreen !== "function") return null;
    const scale = this.zoomScale();
    const visible = this.visibleNodeIds;
    let bestId: string | null = null;
    let bestScreenX = 0;
    let bestScreenY = 0;
    let bestRadiusPx = 0;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    const world: [number, number] = [0, 0];
    for (let i = 0; i < this.indexToId.length; i++) {
      const id = this.indexToId[i];
      if (!id || (visible && !visible.has(id))) continue;
      world[0] = this.lastPositions[i * 2];
      world[1] = this.lastPositions[i * 2 + 1];
      const screen = toScreen.call(zoom, world);
      const radius = Math.max(PICK_RADIUS_PX, this.baseSizes[i] * scale);
      const dx = screen[0] - screenX;
      const dy = screen[1] - screenY;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= radius * radius && distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestId = id;
        bestScreenX = screen[0];
        bestScreenY = screen[1];
        bestRadiusPx = radius;
      }
    }
    this.hoverPickCache = bestId
      ? {
          id: bestId,
          screenX: bestScreenX,
          screenY: bestScreenY,
          radiusPx: bestRadiusPx,
          zoomScale: scale,
        }
      : null;
    return bestId;
  }

  private updatePointerHover(event: PointerEvent): void {
    if (!this.featureFlags.hover) return; // hover layer disabled (set-feature-flags)
    const screen = this.screenPointFromEvent(event);
    if (!screen) return;
    const id =
      this.cachedHoverHit(screen[0], screen[1]) ??
      this.pickNodeAtScreen(screen[0], screen[1]);
    if (id === this.hoveredId) return;
    this.setHoverEmphasis(id);
    this.controller?.emit({ kind: "hover", id });
  }

  private focusPointByIndex(index: number, duration = 250): void {
    if (!this.graph || this.lastPositions.length !== this.indexToId.length * 2) return;
    const x = this.lastPositions[index * 2];
    const y = this.lastPositions[index * 2 + 1];
    const runtime = this.graphRuntime();
    if (typeof runtime?.setZoomTransformByPointPositions === "function") {
      runtime.setZoomTransformByPointPositions(
        [x, y],
        duration,
        Math.max(2.5, this.zoomScale()),
      );
    } else {
      this.graph.fitViewByPointPositions([x, y], duration, 0.25);
    }
    this.emitTrackedAnchors();
  }

  private fitMirroredPositions(duration = 250, padding = 0.1): void {
    if (!this.graph || this.lastPositions.length === 0) return;
    this.graph.fitViewByPointPositions([...this.lastPositions], duration, padding);
    this.emitTrackedAnchors();
  }

  private emitTrackedAnchors(): void {
    const controller = this.controller;
    if (!controller || this.lastPositions.length !== this.indexToId.length * 2) return;
    const visible = this.visibleNodeIds;
    const scale = this.zoomScale();
    for (const id of controller.trackedNodeIds()) {
      const index = this.idToIndex.get(id);
      if (index === undefined || (visible && !visible.has(id))) {
        controller.emitAnchor(id, null);
        continue;
      }
      const screen = this.worldToScreen([
        this.lastPositions[index * 2],
        this.lastPositions[index * 2 + 1],
      ]);
      const anchor: SceneAnchor | null = screen
        ? { x: screen[0], y: screen[1], scale }
        : null;
      controller.emitAnchor(id, anchor);
    }
  }

  /** Centralized render: every frame-driving render() goes through here so the
   *  render-on-demand idle flag never goes stale (render() is the only thing that
   *  restarts cosmos's frame loop). */
  private renderField(alpha?: number): void {
    if (!this.graph) return;
    this.renderLoopIdle = false;
    if (alpha === undefined) this.graph.render();
    else this.graph.render(alpha);
  }

  /** Wake the perpetual rAF loop if it was idled. start()/unpause() do NOT restart
   *  frames (they only flip the sim flag), so any sim (re)start must call this. */
  private ensureRenderLoop(): void {
    if (!this.graph || !this.renderLoopIdle) return;
    this.renderField();
  }

  /** Cosmos has no public one-frame render API: `render(0)` still starts its
   *  continuous rAF loop. Schedule our stop after Cosmos' next callback so
   *  hover/selection/filter paints do not leave a multi-frame render tail. */
  private renderOneShot(alpha = 0): void {
    this.renderField(alpha);
    if (typeof window === "undefined") return;
    if (this.oneShotStopRaf !== null) window.cancelAnimationFrame(this.oneShotStopRaf);
    this.oneShotStopRaf = window.requestAnimationFrame(() => {
      this.oneShotStopRaf = null;
      this.maybeIdle();
    });
  }

  /** Emphasis-only updates already upload their tiny greyout texture before paint.
   *  When the field is idle, draw one Cosmos frame directly and avoid `render(0)`,
   *  which runs the update/init path and starts Cosmos' self-scheduling rAF loop. */
  private paintOneFrame(): void {
    const runtime = this.graphRuntime();
    if (this.renderLoopIdle && typeof runtime?.renderFrame === "function") {
      this.renderLoopIdle = false;
      runtime.renderFrame(nowMs());
      runtime.stopFrames?.();
      this.renderLoopIdle = true;
      return;
    }
    this.renderOneShot();
  }

  /** Halt the rAF loop so the GPU idles at zero. Only safe when nothing needs
   *  animating; gated by maybeIdle. */
  private stopRenderLoop(): void {
    const runtime = this.graphRuntime();
    if (typeof runtime?.stopFrames === "function") {
      runtime.stopFrames();
      this.renderLoopIdle = true;
    }
  }

  /** Debounced idle check; a short grace avoids stranding an in-flight camera
   *  transition or a pointer that briefly leaves and returns. */
  private scheduleIdle(delayMs = 240): void {
    if (typeof window === "undefined") return;
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      this.maybeIdle();
    }, delayMs);
  }

  /** Keep the Cosmos frame loop ALIVE while there is data — continuous 60fps so
   *  canvas pan/zoom, node drag, and hover all render. Render-on-demand idling
   *  (stopFrames after settle) froze the canvas mid-interaction: panning the
   *  background changed the transform but no frame painted. The simulation still
   *  cools and STOPS ticking (settle-and-stop decay), so a settled field is cheap
   *  draw-only frames, not a hot n-body loop. Only idle the GPU when the field is
   *  EMPTY (no points to draw). */
  private maybeIdle(): void {
    if (!this.graph || this.renderLoopIdle) return;
    if (this.pointCount() > 0) return;
    if (this.interacting) return;
    if (this.graphRuntime()?.zoomInstance?.isRunning) return;
    // A running sim (cosmosRunning) keeps frames; the transient pre-start phases
    // (priming/uploading/simulation-pending) mean a start is imminent. A paused or
    // ended sim — including a "simulating" lifecycle that was paused before
    // onSimulationEnd fired — is quiescent and may idle.
    if (this.cosmosRunning()) return;
    if (
      this.rendererLifecycle === "priming" ||
      this.rendererLifecycle === "uploading" ||
      this.rendererLifecycle === "simulation-pending"
    ) {
      return;
    }
    this.stopRenderLoop();
  }

  private armOpeningAutoFit(): void {
    if (this.openingFitTimer !== null) window.clearTimeout(this.openingFitTimer);
    this.openingFitTimer = window.setTimeout(() => {
      this.openingFitTimer = null;
      if (!this.graph || !this.fitPending) return;
      this.ensureRenderLoop();
      this.fitMirroredPositions(200, 0.25);
      this.fitPending = false;
      this.scheduleIdle(600);
    }, 120);
  }

  private clearRendererPriming(): void {
    if (this.primingRaf1 !== null) {
      window.cancelAnimationFrame(this.primingRaf1);
      this.primingRaf1 = null;
    }
    if (this.primingRaf2 !== null) {
      window.cancelAnimationFrame(this.primingRaf2);
      this.primingRaf2 = null;
    }
    if (this.oneShotStopRaf !== null) {
      window.cancelAnimationFrame(this.oneShotStopRaf);
      this.oneShotStopRaf = null;
    }
    this.primingStartedAt = 0;
    this.primingFrameCount = 0;
  }

  private pointCount(): number {
    return this.indexToId.length;
  }

  private setRendererLifecycle(phase: RendererLifecycle, reason: string): void {
    const now = nowMs();
    const ageMs = now - this.rendererLifecycleChangedAt;
    if (this.rendererLifecycle === phase && this.rendererLifecycleTrace.length > 0) {
      return;
    }
    this.rendererLifecycle = phase;
    this.rendererLifecycleChangedAt = now;
    this.rendererLifecycleSeq += 1;
    this.rendererLifecycleTrace = [
      {
        seq: this.rendererLifecycleSeq,
        phase,
        reason,
        ageMs,
        pointCount: this.pointCount(),
        alpha: this.cosmosAlpha(),
        running: this.cosmosRunning(),
        pending: this.pendingSimulationStart,
      },
      ...this.rendererLifecycleTrace,
    ].slice(0, 12);
  }

  command(cmd: SceneCommand): void {
    if (!this.graph) return;
    switch (cmd.kind) {
      case "set-data":
        this.setData(cmd.nodes, cmd.edges);
        break;
      case "set-representation-mode":
        this.setRepresentationMode(cmd.mode);
        break;
      case "set-bounds":
        this.setBounds(cmd.shape, cmd.size);
        break;
      case "set-selected":
        this.setSelected(cmd.ids);
        break;
      case "focus-node": {
        const i = this.idToIndex.get(cmd.id);
        if (i !== undefined) {
          this.ensureRenderLoop();
          this.focusPointByIndex(i);
          this.scheduleIdle(900);
        }
        break;
      }
      case "zoom-in":
        this.ensureRenderLoop();
        this.graph.setZoomLevel(this.graph.getZoomLevel() * 1.25, 250);
        this.scheduleIdle(450);
        break;
      case "zoom-out":
        this.ensureRenderLoop();
        this.graph.setZoomLevel(this.graph.getZoomLevel() / 1.25, 250);
        this.scheduleIdle(450);
        break;
      case "fit-to-view":
      case "reset-view":
        this.ensureRenderLoop();
        this.fitMirroredPositions(400);
        this.scheduleIdle(600);
        break;
      case "set-cosmos-config":
        this.setCosmosConfig(cmd.config);
        break;
      case "set-simulation-active":
        this.setSimulationActive(cmd.active);
        break;
      case "set-edge-render-params":
        this.setEdgeRenderParams(cmd.params);
        break;
      case "set-frozen":
        this.setFrozen(cmd.frozen);
        break;
      case "begin-interaction":
        this.beginCosmosInteraction();
        break;
      case "end-interaction":
        this.endCosmosInteraction();
        break;
      case "set-pinned":
        this.setPinned(cmd.ids);
        break;
      case "apply-deltas":
        this.applyDeltas(cmd.deltas);
        break;
      case "set-visibility":
        this.setVisibility(cmd.visibleNodeIds, cmd.visibleEdgeIds);
        break;
      case "pulse":
        this.pulseNodes(cmd.ids);
        break;
      case "set-time":
        // The field does not own the time slice: the stores layer drives time
        // travel by pushing the replayed slice through `set-data`. Acknowledged
        // explicitly so the command is intentionally handled, never silently
        // dropped (scene-command-gap-003); the field has no per-frame time state.
        break;
      case "set-overlays":
        // Feature-country labels and BubbleSets hulls render in a separate overlay
        // layer, not the cosmos point/link field. Acknowledged explicitly (not
        // silently dropped); CosmosField carries no overlay geometry to toggle.
        break;
      case "set-feature-flags":
        this.setFeatureFlags(cmd.flags);
        break;
    }
  }

  /** Toggle interaction layers (hover/selection/cluster). Disabling a layer clears
   *  its current emphasis immediately so the field strips back to bare
   *  nodes+edges+sim without a stale highlight lingering. */
  private setFeatureFlags(flags: Partial<SceneFeatureFlags>): void {
    this.featureFlags = { ...this.featureFlags, ...flags };
    if (!this.featureFlags.hover && this.hoveredId !== null) {
      this.hoveredId = null;
      this.hoverEmphasisIds = new Set<string>();
      this.clearHoverPickCache();
      this.controller?.emit({ kind: "hover", id: null });
    }
    if (!this.featureFlags.selection) this.selectedIds = new Set<string>();
    if (!this.featureFlags.clusterHighlight) this.refreshHoverEmphasis();
    this.applyVisualState({ emphasis: true });
  }

  private graphRuntime(): CosmosRuntimeGraph | null {
    return this.graph as unknown as CosmosRuntimeGraph | null;
  }

  /** Alpha from the public onSimulationTick callback (captured in lastAlpha); reset
   *  to 0 on simulation end. cosmos exposes no public alpha getter, so this is the
   *  supported reading — never the private store.alpha. */
  private cosmosAlpha(): number {
    return this.lastAlpha;
  }

  private cosmosRunning(): boolean {
    return Boolean(this.graph?.isSimulationRunning);
  }

  private cosmosForceConfig(): Record<string, unknown> {
    return cosmosGraphConfig(this.cosmosConfig, this.interacting);
  }

  private applyCosmosForceConfig(): void {
    this.graph?.setConfig(this.cosmosForceConfig());
  }

  private preferSimulationStart(
    current: SimulationStartKind | null,
    next: SimulationStartKind,
  ): SimulationStartKind {
    const priority: Record<SimulationStartKind, number> = {
      cold: 5,
      interaction: 4,
      pin: 3,
      param: 2,
      warm: 1,
    };
    return current && priority[current] >= priority[next] ? current : next;
  }

  private startCosmosSimulation(kind: SimulationStartKind): void {
    if (!COSMOS_GPU_SIMULATION_ENABLED) {
      this.graph?.pause();
      this.simulationRequested = false;
      this.simulationStarted = false;
      this.pendingSimulationStart = null;
      if (this.pointCount() > 0)
        this.setRendererLifecycle("static-ready", `simulation-disabled:${kind}`);
      this.scheduleIdle();
      return;
    }
    if (!this.graph || this.frozen || !this.simulationRequested) return;
    if (this.pointCount() === 0) {
      if (this.rendererLifecycle !== "empty") {
        this.setRendererLifecycle("empty", `simulation-start-without-data:${kind}`);
      }
      return;
    }
    if (
      this.rendererLifecycle === "uploading" ||
      this.rendererLifecycle === "priming"
    ) {
      this.pendingSimulationStart = this.preferSimulationStart(
        this.pendingSimulationStart,
        kind,
      );
      return;
    }
    const alpha =
      kind === "cold"
        ? this.cosmosConfig.coldStartAlpha
        : kind === "param"
          ? this.cosmosConfig.changeStartAlpha
          : kind === "pin"
            ? this.cosmosConfig.pinStartAlpha
            : kind === "interaction"
              ? this.cosmosConfig.interactionStartAlpha
              : this.cosmosConfig.warmStartAlpha;
    this.graph.start(Math.max(0, alpha));
    // start() only flips the sim flag; the rAF loop must be (re)started via render.
    this.ensureRenderLoop();
    this.simulationStarted = true;
    this.pendingSimulationStart = null;
    this.setRendererLifecycle("simulating", `simulation-start:${kind}`);
  }

  private primeRendererThenStart(kind: SimulationStartKind): void {
    if (!COSMOS_GPU_SIMULATION_ENABLED) {
      this.pendingSimulationStart = null;
      this.rendererPrimed = true;
      this.setRendererLifecycle(
        this.pointCount() > 0 ? "static-ready" : "empty",
        `renderer-static:${kind}`,
      );
      this.scheduleIdle();
      return;
    }
    this.clearRendererPriming();
    this.pendingSimulationStart = this.preferSimulationStart(
      this.pendingSimulationStart,
      kind,
    );
    // Already primed this mount: skip the RAF warmup and start immediately. A live
    // content delta therefore reheats at its (gentle) requested alpha instead of
    // paying the cold warmup + a hard 0.75 re-settle on every refetch.
    if (this.rendererPrimed) {
      this.setRendererLifecycle("simulation-pending", "renderer-already-primed");
      const pending = this.pendingSimulationStart;
      if (pending) this.startCosmosSimulation(pending);
      return;
    }
    this.primingStartedAt = nowMs();
    this.primingFrameCount = 0;
    this.setRendererLifecycle("priming", `renderer-prime:${kind}`);
    const step = (time: number) => {
      this.primingRaf1 = null;
      if (!this.graph || this.rendererLifecycle !== "priming") return;
      this.primingFrameCount += 1;
      const elapsed = time - this.primingStartedAt;
      const primed =
        (this.primingFrameCount >= RENDERER_PRIMING_MIN_FRAMES &&
          elapsed >= RENDERER_PRIMING_MIN_MS) ||
        elapsed >= RENDERER_PRIMING_MAX_MS;
      if (!primed) {
        this.primingRaf1 = window.requestAnimationFrame(step);
        return;
      }
      this.rendererPrimed = true;
      this.setRendererLifecycle("simulation-pending", "renderer-prime-complete");
      const pending = this.pendingSimulationStart;
      if (pending) this.startCosmosSimulation(pending);
    };
    this.primingRaf1 = window.requestAnimationFrame(step);
  }

  private setCosmosConfig(config: Partial<CosmosSimulationConfig>): void {
    this.cosmosConfig = { ...this.cosmosConfig, ...config };
    this.applyCosmosForceConfig();
    if (!COSMOS_GPU_SIMULATION_ENABLED) {
      this.renderField(0);
      this.scheduleIdle();
      return;
    }
    this.startCosmosSimulation("param");
  }

  private setSimulationActive(active: boolean): void {
    if (!COSMOS_GPU_SIMULATION_ENABLED) {
      this.simulationRequested = false;
      this.simulationStarted = false;
      this.pendingSimulationStart = null;
      this.graph?.pause();
      this.scheduleIdle();
      return;
    }
    if (this.staticLayoutActive && active) {
      this.simulationRequested = false;
      this.graph?.pause();
      this.scheduleIdle();
      return;
    }
    this.simulationRequested = active;
    if (!this.graph) return;
    if (!active || this.frozen) {
      this.graph.pause();
      this.scheduleIdle();
      return;
    }
    if (!this.simulationStarted) {
      this.startCosmosSimulation(this.pendingSimulationStart ?? "warm");
      return;
    }
    this.graph.unpause();
    // unpause() only flips the flag; restart the rAF loop if it was idled.
    this.ensureRenderLoop();
  }

  private setFrozen(frozen: boolean): void {
    this.frozen = frozen;
    if (!this.graph) return;
    if (frozen) {
      this.graph.pause();
      this.scheduleIdle();
    } else this.setSimulationActive(this.simulationRequested);
  }

  private beginCosmosInteraction(): void {
    if (!COSMOS_GPU_SIMULATION_ENABLED) {
      this.interacting = true;
      this.renderField(0);
      return;
    }
    this.interacting = true;
    this.applyCosmosForceConfig();
    this.startCosmosSimulation("interaction");
  }

  private endCosmosInteraction(): void {
    this.interacting = false;
    this.applyCosmosForceConfig();
    this.setSimulationActive(this.simulationRequested);
  }

  private setPinned(ids: ReadonlySet<string>): void {
    const indices: number[] = [];
    for (const id of ids) {
      const i = this.idToIndex.get(id);
      if (i !== undefined) indices.push(i);
    }
    this.graph?.setPinnedPoints(indices);
    if (!COSMOS_GPU_SIMULATION_ENABLED) {
      this.renderField(0);
      this.scheduleIdle();
      return;
    }
    this.startCosmosSimulation("pin");
  }

  /**
   * The lightweight live-update path (apply-deltas, scene-command-gap-003): fold
   * add/remove/change ops into the held node/edge set, then upload through the
   * existing keyframe path. Under the corpus-bounded sim budget a reheat is cheap
   * (changeStartAlpha + retained slots), so this is correct without a bespoke
   * incremental-buffer mutation; the dedup signature skips a no-op delta batch.
   */
  private applyDeltas(deltas: readonly SceneDelta[]): void {
    if (!this.graph || deltas.length === 0) return;
    const nodeById = new Map<string, SceneNodeData>(
      this.currentNodes.map((n) => [n.id, n]),
    );
    const edgeById = new Map<string, SceneEdgeData>(
      this.currentEdges.map((e) => [e.id, e]),
    );
    for (const d of deltas) {
      if (d.node) {
        if (d.op === "remove") {
          nodeById.delete(d.node.id);
          for (const [edgeId, edge] of edgeById) {
            if (edge.src === d.node.id || edge.dst === d.node.id) {
              edgeById.delete(edgeId);
            }
          }
        } else {
          nodeById.set(d.node.id, d.node);
        }
      }
      if (d.edge) {
        if (d.op === "remove") edgeById.delete(d.edge.id);
        else edgeById.set(d.edge.id, d.edge);
      }
    }
    this.setData([...nodeById.values()], [...edgeById.values()]);
  }

  /**
   * Apply a visibility membership (set-visibility, scene-command-gap-003): hide
   * nodes/edges outside the set by zeroing their point size / link width — a
   * channel DISTINCT from the emphasis greyout (opacity), so a filter and a
   * hover/selection emphasis compose rather than fight. null members mean "all
   * visible". Retained so the mask survives a subsequent set-data keyframe.
   */
  private setVisibility(
    visibleNodeIds: ReadonlySet<string>,
    visibleEdgeIds: ReadonlySet<string>,
  ): void {
    this.clearHoverPickCache();
    this.visibleNodeIds = visibleNodeIds;
    this.visibleEdgeIds = visibleEdgeIds;
    this.applyVisualState({ visibility: true });
  }

  /** VISIBILITY channel (size/width → 0 for filtered-out nodes/edges). A pure GPU
   *  write — no paint, no hover logic; the coordinator (applyVisualState) owns
   *  paint and the hover-out-on-hide reconciliation. Never call directly. */
  private applyVisibilityChannel(): void {
    if (!this.graph) return;
    const nodeMask = this.visibleNodeIds;
    const edgeMask = this.visibleEdgeIds;
    if (nodeMask && this.baseSizes.length === this.indexToId.length) {
      const sizes = new Float32Array(this.baseSizes.length);
      for (let i = 0; i < sizes.length; i++) {
        sizes[i] = nodeMask.has(this.indexToId[i]) ? this.baseSizes[i] : 0;
      }
      this.graph.setPointSizes(sizes);
    }
    if (edgeMask && this.baseLinkWidths.length === this.linkEdgeIds.length) {
      const widths = new Float32Array(this.baseLinkWidths.length);
      for (let i = 0; i < widths.length; i++) {
        widths[i] = edgeMask.has(this.linkEdgeIds[i]) ? this.baseLinkWidths[i] : 0;
      }
      this.graph.setLinkWidths(widths);
    }
  }

  /**
   * Transient cross-highlight (pulse, scene-command-gap-003): flash the named
   * nodes via the native greyout at highest emphasis precedence, then revert to the
   * hover/selection emphasis after a short window. GPU-resident (one greyout
   * upload), no per-frame work.
   */
  private pulseNodes(ids: ReadonlySet<string>): void {
    if (!this.graph || ids.size === 0) return;
    this.pulseIds = new Set(ids);
    this.applyVisualState({ emphasis: true });
    if (this.pulseTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(this.pulseTimer);
    }
    if (typeof window !== "undefined") {
      this.pulseTimer = window.setTimeout(() => {
        this.pulseTimer = null;
        this.pulseIds.clear();
        this.applyVisualState({ emphasis: true });
      }, 1100);
    }
  }

  /** The shared selection (set-selected). Drives the same native-greyout emphasis
   *  as hover; cosmos's focused-point ring marks the selected node.
   *
   *  Semantic-equality guard (selection-emphasis-005): the canonical selection is
   *  re-projected to the scene on every dashboard-state identity change, so an
   *  unchanged set would otherwise re-run applyEmphasis (an O(N) greyout upload that
   *  also WAKES the render loop) for no reason. A set with the same membership is a
   *  no-op — the emphasis already on the GPU stays as-is. */
  private setSelected(ids: ReadonlySet<string>): void {
    const next = this.featureFlags.selection ? ids : EMPTY_ID_SET;
    if (sameIdSet(next, this.selectedIds)) return;
    this.selectedIds = new Set(next);
    this.applyVisualState({ emphasis: true });
  }

  /**
   * The ONE dimming mechanism for both hover and selection: feed the active
   * emphasis set to cosmos's native selection greyout (selectPointsByIndices), so
   * the GPU dims every point/link outside it to GREYOUT_*_OPACITY. Hover cohort
   * takes visual precedence while hovering; otherwise the shared selection drives
   * it. The selection ring (focusedPointIndex) tracks the selected node
   * independently, so it persists while hovering. No colour-buffer mutation.
   */
  /**
   * THE single source of truth for the emphasis + visibility GPU channels and the
   * SOLE place that paints them. Every mutator — selection, hover, pulse,
   * visibility, feature-flags, set-data — updates state then calls this. `dirty`
   * scopes which channels recompute so a hover does NOT re-upload the visibility
   * mask and a filter does NOT re-run the greyout (centralized, channel-scoped,
   * never the old two-applier fragmentation). Visibility writes first (size/width),
   * then emphasis (greyout opacity + focus ring) — orthogonal channels, order-safe.
   */
  private applyVisualState(
    dirty: { emphasis?: boolean; visibility?: boolean } = {
      emphasis: true,
      visibility: true,
    },
  ): void {
    if (!this.graph) return;
    let emphasis = dirty.emphasis ?? false;
    if (dirty.visibility) {
      this.applyVisibilityChannel();
      this.emitTrackedAnchors();
      // A filter that hides the hovered node clears the hover and forces an
      // emphasis recompute, so a greyout cohort never outlives its visible anchor.
      if (
        this.visibleNodeIds &&
        this.hoveredId &&
        !this.visibleNodeIds.has(this.hoveredId)
      ) {
        this.hoveredId = null;
        this.hoverEmphasisIds = new Set<string>();
        this.controller?.emit({ kind: "hover", id: null });
        emphasis = true;
      }
    }
    if (emphasis) this.applyEmphasisChannel();
    this.paintOneFrame();
  }

  /** EMPHASIS channel: cosmos's native greyout (selectPointsByIndices dims every
   *  point/link outside the active set) + the selection focus ring. Precedence:
   *  pulse > hover-cohort > selection. Pure GPU write — no paint; the coordinator
   *  (applyVisualState) owns paint. Never call directly. */
  private applyEmphasisChannel(): void {
    if (!this.graph) return;
    const activeIds =
      this.pulseIds.size > 0
        ? this.pulseIds
        : this.hoverEmphasisIds.size > 0
          ? this.hoverEmphasisIds
          : this.selectedIds.size > 0
            ? this.selectedIds
            : null;
    if (activeIds) {
      const indices: number[] = [];
      for (const id of activeIds) {
        const i = this.idToIndex.get(id);
        if (i !== undefined) indices.push(i);
      }
      if (indices.length > 0) this.graph.selectPointsByIndices(indices);
      else this.graph.unselectPoints();
    } else {
      this.graph.unselectPoints();
    }
    // Selection ring: first selected node present in the slice, independent of hover.
    let focused: number | undefined;
    for (const id of this.selectedIds) {
      const i = this.idToIndex.get(id);
      if (i !== undefined) {
        focused = i;
        break;
      }
    }
    this.graph.setConfig({ focusedPointIndex: focused });
  }

  private debugSelectedIds(): string[] {
    const selected: string[] = [];
    for (const id of this.selectedIds) {
      if (this.idToIndex.has(id)) {
        selected.push(id);
      }
    }
    return selected;
  }

  private setHoverEmphasis(id: string | null): void {
    if (id === this.hoveredId) return;
    this.hoveredId = id;
    this.refreshHoverEmphasis();
    this.applyVisualState({ emphasis: true });
  }

  private refreshHoverEmphasis(): void {
    this.hoverEmphasisIds = this.hoveredId
      ? this.buildHoverEmphasisIds(this.hoveredId)
      : new Set<string>();
    if (this.hoveredId && this.hoverEmphasisIds.size === 0) {
      this.hoveredId = null;
    }
  }

  private buildHoverEmphasisIds(id: string): Set<string> {
    const hoveredNode = this.currentNodes.find((node) => node.id === id);
    if (!hoveredNode) return new Set<string>();
    // Cluster-highlight disabled: light only the hovered node, never its cohort.
    if (!this.featureFlags.clusterHighlight) return new Set<string>([id]);
    const featureTags = this.featureTagsForNode(hoveredNode);
    const emphasized = new Set<string>([id]);
    // Union the precomputed per-tag cohorts (O(cohort)) instead of re-scanning and
    // re-tagging every node on each hover (O(nodes) + per-node allocation).
    for (const tag of featureTags) {
      const cohort = this.tagToNodeIds.get(tag);
      if (!cohort) continue;
      for (const nodeId of cohort) emphasized.add(nodeId);
    }
    return emphasized;
  }

  /** Build the feature-tag -> node-id index for the current slice (one pass). */
  private rebuildTagIndex(): void {
    this.tagToNodeIds.clear();
    for (const node of this.currentNodes) {
      for (const tag of this.featureTagsForNode(node)) {
        let cohort = this.tagToNodeIds.get(tag);
        if (!cohort) {
          cohort = new Set<string>();
          this.tagToNodeIds.set(tag, cohort);
        }
        cohort.add(node.id);
      }
    }
  }

  private featureTagsForNode(node: SceneNodeData): string[] {
    const tags = new Set(node.featureTags ?? []);
    if (node.kind === "feature" && node.id.startsWith("feature:")) {
      tags.add(node.id.slice("feature:".length));
    }
    return [...tags];
  }

  /** Apply the configurable bound as SOFT center gravity (the knowledge-graph
   *  norm), not a hard clamp: free = loose, circle = tight round blob, rect =
   *  medium compatibility; an explicit size tightens/loosens it. */
  private setBounds(shape: BoundShape, size?: number): void {
    this.bounds = { shape, size: size ?? 0 };
    this.cosmosConfig = {
      ...this.cosmosConfig,
      simulationGravity: centerStrength(shape, this.bounds.size),
    };
    this.applyCosmosForceConfig();
    this.fitPending = true;
    if (!COSMOS_GPU_SIMULATION_ENABLED || this.staticLayoutActive) {
      this.lastSignature = "";
      this.setData(this.currentNodes, this.currentEdges);
      return;
    }
    this.armOpeningAutoFit();
    this.startCosmosSimulation("param");
  }

  private setEdgeRenderParams(params: Partial<EdgeRenderParams>): void {
    const lineWidthScale =
      typeof params.lineWidthScale === "number" &&
      Number.isFinite(params.lineWidthScale)
        ? Math.max(0, params.lineWidthScale)
        : this.edgeRenderParams.lineWidthScale;
    this.edgeRenderParams = { ...this.edgeRenderParams, lineWidthScale };
    this.graph?.setConfig({ linkWidthScale: lineWidthScale });
    this.renderField();
  }

  private setData(
    nodes: readonly SceneNodeData[],
    edges: readonly SceneEdgeData[],
  ): void {
    if (!this.graph) return;
    this.clearHoverPickCache();
    this.currentNodes = nodes;
    this.currentEdges = edges;

    // Tier-2 dedup: an identical refetch (same node ids + edge endpoints) is a
    // wholesale no-op - no re-upload, no re-place, no re-fit, so it cannot bounce.
    const signature = contentSignature(nodes, edges);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.clearRendererPriming();
    this.pendingSimulationStart = null;
    this.simulationStarted = false;
    this.graph.pause();
    this.setRendererLifecycle("uploading", "set-data");

    this.idToIndex.clear();
    this.indexToId = new Array(nodes.length);
    const count = nodes.length;
    if (count === 0) {
      if (this.openingFitTimer !== null) {
        window.clearTimeout(this.openingFitTimer);
        this.openingFitTimer = null;
      }
      this.clearRendererPriming();
      this.slotById.clear();
      this.freeSlots = [];
      this.nextSlot = 0;
      this.capacity = 1;
      this.droppedEdges = 0;
      this.lodDroppedEdges = 0;
      this.pointSizeStats = { min: 0, max: 0, avg: 0 };
      this.hoveredId = null;
      this.hoverEmphasisIds.clear();
      this.clearHoverPickCache();
      this.basePointColors = new Float32Array();
      this.baseLinkColors = new Float32Array();
      this.baseSizes = new Float32Array();
      this.baseLinkWidths = new Float32Array();
      this.lastPositions = new Float32Array();
      this.linkEndpointIds = [];
      this.linkEdgeIds = [];
      this.tagToNodeIds.clear();
      this.simulationStarted = false;
      this.pendingSimulationStart = null;
      this.graph.setPointPositions(new Float32Array(), true);
      this.graph.setLinks(new Float32Array());
      this.renderField(0);
      this.applyVisualState({ emphasis: true });
      this.emitTrackedAnchors();
      this.setRendererLifecycle("empty", "set-data-empty");
      this.scheduleIdle();
      return;
    }
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 4);
    let maxDiameter = 0;
    let minPointSize = Number.POSITIVE_INFINITY;
    let pointSizeSum = 0;

    // Tier-2 retention: free the slots of nodes that left, so survivors keep their
    // slot (and position) and only genuinely-new ids get fresh (reused-or-appended)
    // slots below - the field never re-shuffles on a delta.
    const presentIds = new Set<string>(nodes.map((n) => n.id));
    for (const [id, slot] of this.slotById) {
      if (!presentIds.has(id)) {
        this.freeSlots.push(slot);
        this.slotById.delete(id);
      }
    }

    nodes.forEach((node, i) => {
      this.idToIndex.set(node.id, i);
      this.indexToId[i] = node.id;
      const pointSize = cosmosPointSize(node);
      sizes[i] = pointSize;
      minPointSize = Math.min(minPointSize, pointSize);
      pointSizeSum += pointSize;
      if (pointSize > maxDiameter) maxDiameter = pointSize;
      // Category fill from the vault DOC TYPE first (adr/plan/exec/...), falling
      // back to the generic node species (`kind`) for nodes with no doc type. The
      // wire `kind` alone is the species, not the category, so colouring by it
      // collapses ~all document/plan-container nodes onto the single `code` swatch.
      const [r, g, b, a] = rgba(categoryColor(node.docType ?? node.kind));
      colors[i * 4] = r;
      colors[i * 4 + 1] = g;
      colors[i * 4 + 2] = b;
      colors[i * 4 + 3] = a;
      if (!this.slotById.has(node.id)) {
        const slot = this.freeSlots.length ? this.freeSlots.pop()! : this.nextSlot++;
        this.slotById.set(node.id, slot);
      }
    });
    this.pointSizeStats = {
      min: minPointSize === Number.POSITIVE_INFINITY ? 0 : minPointSize,
      max: maxDiameter,
      avg: count > 0 ? pointSizeSum / count : 0,
    };
    // Capacity only grows, so the radius - and thus every kept slot's position -
    // stays stable across deltas: the no-bounce guarantee.
    this.capacity = Math.max(this.capacity, this.nextSlot);

    // Seed each point by its stable slot inside the active bound (default free),
    // non-overlapping by construction. Cosmos starts from these positions and then
    // owns the live force simulation.
    const positions = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const seed = nodes[i]?.seedPosition;
      if (seed && Number.isFinite(seed.x) && Number.isFinite(seed.y)) {
        positions[i * 2] = seed.x;
        positions[i * 2 + 1] = seed.y;
      } else {
        const slot = this.slotById.get(this.indexToId[i])!;
        slotPosition(positions, i, slot, this.bounds, this.capacity, maxDiameter);
      }
    }
    this.applyRepresentationPositions(positions);

    // Tier-3 edge encoding: build the link list plus per-link colour (tier),
    // width and opacity (confidence) + state dimming. Tier colours are read live so
    // they track the active theme. Cross-boundary edges (an endpoint absent from
    // this slice) are dropped and COUNTED, never silently lost.
    const tierColors: Record<string, [number, number, number, number]> = {
      declared: rgba(cssColorNumber("--color-tier-declared", 0x312d27)),
      structural: rgba(cssColorNumber("--color-tier-structural", 0x3f774d)),
      temporal: rgba(cssColorNumber("--color-tier-temporal", 0x5c5040)),
      semantic: rgba(cssColorNumber("--color-tier-semantic", 0x8b85b7)),
      rule: rgba(cssColorNumber("--color-scene-rule", 0xd8d2ca)),
    };
    // Bounded-by-default: cap the edges fed to cosmos (couples render + sim).
    const { kept: simEdges, lodDropped } = boundEdgesForSim(edges, EDGE_SIM_CAP);
    this.lodDroppedEdges = lodDropped;
    const linkList: number[] = [];
    const linkColors: number[] = [];
    const linkWidths: number[] = [];
    const linkEndpointIds: [string, string][] = [];
    const linkEdgeIds: string[] = [];
    let dropped = 0;
    for (const e of simEdges) {
      const s = this.idToIndex.get(e.src);
      const t = this.idToIndex.get(e.dst);
      if (s === undefined || t === undefined) {
        dropped++;
        continue;
      }
      linkList.push(s, t);
      linkEndpointIds.push([e.src, e.dst]);
      linkEdgeIds.push(e.id);
      const ap = edgeAppearance(e, tierColors);
      linkColors.push(ap.r, ap.g, ap.b, ap.a);
      linkWidths.push(ap.width);
    }
    this.droppedEdges = dropped;
    this.basePointColors = colors;
    this.baseLinkColors = new Float32Array(linkColors);
    this.baseSizes = sizes;
    this.baseLinkWidths = new Float32Array(linkWidths);
    this.linkEndpointIds = linkEndpointIds;
    this.linkEdgeIds = linkEdgeIds;
    this.rebuildTagIndex();
    this.refreshHoverEmphasis();

    const shouldAutoFitOpening = count > 0 && this.fitPending;

    // Cosmos data upload: topology/appearance change only. Live movement after
    // this point is Cosmos' simulation loop, not an external per-frame upload.
    this.lastPositions = positions;
    this.graph.setPointPositions(positions, true);
    this.graph.setPointColors(this.basePointColors);
    this.graph.setPointSizes(sizes);
    this.graph.setLinks(new Float32Array(linkList));
    this.graph.setLinkColors(this.baseLinkColors);
    this.graph.setLinkWidths(new Float32Array(linkWidths));
    this.applyCosmosForceConfig();
    this.renderField(0);
    // One centralized pass re-derives BOTH channels off the fresh base buffers:
    // emphasis (greyout/ring) and the retained visibility filter (which would
    // otherwise be reset to full size by this keyframe). emitTrackedAnchors runs
    // inside the visibility pass.
    this.applyVisualState({ emphasis: true, visibility: true });
    if (shouldAutoFitOpening) this.armOpeningAutoFit();
    if (this.staticLayoutActive || !COSMOS_GPU_SIMULATION_ENABLED) {
      this.pendingSimulationStart = null;
      this.graph.pause();
      this.simulationStarted = false;
      this.setRendererLifecycle(
        "static-ready",
        this.staticLayoutActive ? "static-layout" : "static-upload",
      );
      this.scheduleIdle();
    } else {
      // First load reheats COLD (full warmup + settle); a subsequent content delta
      // reheats GENTLY (changeStartAlpha) because slots are retained and the field
      // is already laid out — only the changed neighbourhood needs to re-settle.
      this.primeRendererThenStart(this.rendererPrimed ? "param" : "cold");
    }
  }

  private applyRepresentationPositions(positions: Float32Array): void {
    const result = representationLayout(
      this.representationMode,
      this.currentNodes,
      this.currentEdges,
    );
    this.appliedRepresentationMode = result.applied;
    this.staticLayoutActive = result.positions !== null;
    if (!result.positions) return;
    for (let i = 0; i < this.indexToId.length; i++) {
      const p = result.positions.get(this.indexToId[i]);
      if (!p) continue;
      positions[i * 2] = p.x;
      positions[i * 2 + 1] = p.y;
    }
  }

  private setRepresentationMode(mode: RepresentationMode): void {
    this.representationMode = mode;
    if (!this.graph) return;
    if (!COSMOS_GPU_SIMULATION_ENABLED) {
      this.lastSignature = "";
      this.setData(this.currentNodes, this.currentEdges);
      this.controller?.emit({
        kind: "representation-mode-changed",
        requested: mode,
        applied: this.appliedRepresentationMode,
        ...(this.appliedRepresentationMode !== mode
          ? {
              downgradeReason: `${mode} mode downgraded to ${this.appliedRepresentationMode}`,
            }
          : {}),
      });
      return;
    }
    // Base positions come from the CPU mirror of the last uploaded layout — NEVER a
    // graph.getPointPositions() GPU→CPU readback (a pipeline stall). A static layout
    // overwrites every laid node; an un-laid node keeps its mirrored seed position.
    const count = this.indexToId.length;
    const base =
      this.lastPositions.length === count * 2
        ? new Float32Array(this.lastPositions)
        : new Float32Array(count * 2);
    this.applyRepresentationPositions(base);
    this.controller?.emit({
      kind: "representation-mode-changed",
      requested: mode,
      applied: this.appliedRepresentationMode,
      ...(this.appliedRepresentationMode !== mode
        ? {
            downgradeReason: `${mode} mode downgraded to ${this.appliedRepresentationMode}`,
          }
        : {}),
    });
    if (this.staticLayoutActive) {
      // A static layout OWNS positions: upload the computed seed once, mirror it,
      // and freeze. This is the only position write a mode change makes.
      if (base.length > 0) {
        this.lastPositions = base;
        this.graph.setPointPositions(base, true);
        this.renderField(0);
      }
      this.simulationRequested = false;
      this.simulationStarted = false;
      this.pendingSimulationStart = null;
      this.graph.pause();
      this.scheduleIdle();
    } else {
      // connectivity: the force sim owns positions on the GPU. Don't read or write
      // them — just (re)run the sim from wherever the points currently sit.
      this.setSimulationActive(this.simulationRequested);
    }
  }

  resize(): void {
    // cosmos observes the container element's size and re-renders on its own.
  }

  destroy(): void {
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.container && this.pointerHandlers) {
      this.container.removeEventListener("pointerenter", this.pointerHandlers.enter);
      this.container.removeEventListener("pointermove", this.pointerHandlers.move);
      this.container.removeEventListener("wheel", this.pointerHandlers.wheel);
      this.container.removeEventListener("pointerleave", this.pointerHandlers.leave);
      this.container.removeEventListener("click", this.pointerHandlers.click, true);
      this.container.removeEventListener(
        "dblclick",
        this.pointerHandlers.dblclick,
        true,
      );
      this.container.removeEventListener(
        "contextmenu",
        this.pointerHandlers.contextmenu,
        true,
      );
    }
    this.pointerHandlers = null;
    this.renderLoopIdle = false;
    this.clearHoverPickCache();
    this.graph?.destroy();
    this.graph = null;
    this.container?.remove();
    this.container = null;
    this.idToIndex.clear();
    this.indexToId = [];
    this.slotById.clear();
    this.selectedIds.clear();
    this.hoveredId = null;
    this.hoverEmphasisIds.clear();
    this.basePointColors = new Float32Array();
    this.baseLinkColors = new Float32Array();
    this.baseSizes = new Float32Array();
    this.baseLinkWidths = new Float32Array();
    this.lastPositions = new Float32Array();
    this.linkEndpointIds = [];
    this.linkEdgeIds = [];
    this.visibleNodeIds = null;
    this.visibleEdgeIds = null;
    if (this.pulseTimer !== null) {
      window.clearTimeout(this.pulseTimer);
      this.pulseTimer = null;
    }
    this.pulseIds.clear();
    this.tagToNodeIds.clear();
    this.freeSlots = [];
    this.nextSlot = 0;
    this.capacity = 1;
    this.lastSignature = "";
    this.currentNodes = [];
    this.currentEdges = [];
    this.representationMode = DEFAULT_REPRESENTATION_MODE;
    this.appliedRepresentationMode = DEFAULT_REPRESENTATION_MODE;
    this.staticLayoutActive = false;
    this.fitPending = true;
    this.clearRendererPriming();
    if (this.openingFitTimer !== null) {
      window.clearTimeout(this.openingFitTimer);
      this.openingFitTimer = null;
    }
    this.edgeRenderParams = { ...EDGE_RENDER_DEFAULTS };
    this.pointSizeStats = { min: 0, max: 0, avg: 0 };
    this.cosmosConfig = { ...COSMOS_SIMULATION_DEFAULTS };
    this.simulationRequested = false;
    this.simulationStarted = false;
    this.rendererLifecycle = "empty";
    this.rendererLifecycleSeq = 0;
    this.rendererLifecycleChangedAt = nowMs();
    this.rendererLifecycleTrace = [];
    this.pendingSimulationStart = null;
    this.frozen = false;
    this.interacting = false;
    this.lastAlpha = 0;
    this.rendererPrimed = false;
  }

  /** Warm-start persistence lands in a later tier; no-op for now. */
  setPersistenceScope(_workspace: string, _scope: string): void {
    void _workspace;
    void _scope;
  }

  /** Dev/test inspection for NON-tautological verification: the live cosmos point
   *  positions (is it real? do nodes overlap? is it moving when a force is on?).
   *
   *  `getPointPositions()` is a GPU->CPU readback (a pipeline stall, GPU-power-
   *  independent) and MUST NOT run on a timer or per frame. The point dump is
   *  therefore OPT-IN and CAPPED via `options.includePoints`; the default snapshot
   *  reads no positions and derives `pointCount` from the id map. */
  debugSnapshot(options: { includePoints?: number } = {}): {
    pointCount: number;
    bounds: FieldBounds;
    droppedEdges: number;
    lodDroppedEdges: number;
    edgeRender: EdgeRenderParams;
    simulationState: { active: boolean; running: boolean; alpha: number } | null;
    rendererLifecycle: RendererLifecycle;
    rendererLifecycleAgeMs: number;
    rendererLifecycleSeq: number;
    rendererLifecycleTrace: RendererLifecycleTraceEntry[];
    rendererPriming: {
      active: boolean;
      frameCount: number;
      elapsedMs: number;
      minFrames: number;
      minMs: number;
      maxMs: number;
    };
    pendingSimulationStart: SimulationStartKind | null;
    selectedIds: string[];
    hoveredId: string | null;
    hoverEmphasisIds: string[];
    hoverEmphasisEdgeCount: number;
    representationMode: {
      requested: RepresentationMode;
      applied: RepresentationMode;
      staticLayout: boolean;
    };
    temporal: {
      bucketCount: number;
      nodeCount: number;
      buckets: { key: string; count: number }[];
    };
    cosmosConfig: CosmosSimulationConfig | null;
    pointSizeStats: PointSizeStats;
    points: { id: string; x: number; y: number }[];
  } {
    const includePoints = options.includePoints ?? 0;
    const points: { id: string; x: number; y: number }[] = [];
    if (includePoints > 0) {
      // OPT-IN readback only: capped to the requested sample, never the full set.
      const flat = this.graph?.getPointPositions() ?? [];
      const limit = Math.min(includePoints, Math.floor(flat.length / 2));
      for (let i = 0; i < limit; i++) {
        points.push({
          id: this.indexToId[i] ?? String(i),
          x: flat[i * 2],
          y: flat[i * 2 + 1],
        });
      }
    }
    return {
      pointCount: this.pointCount(),
      bounds: { ...this.bounds },
      droppedEdges: this.droppedEdges,
      lodDroppedEdges: this.lodDroppedEdges,
      edgeRender: { ...this.edgeRenderParams },
      simulationState: this.graph
        ? {
            active: this.simulationRequested,
            running: this.cosmosRunning(),
            alpha: this.cosmosAlpha(),
          }
        : null,
      rendererLifecycle: this.rendererLifecycle,
      rendererLifecycleAgeMs: nowMs() - this.rendererLifecycleChangedAt,
      rendererLifecycleSeq: this.rendererLifecycleSeq,
      rendererLifecycleTrace: this.rendererLifecycleTrace,
      rendererPriming: {
        active: this.rendererLifecycle === "priming",
        frameCount: this.primingFrameCount,
        elapsedMs:
          this.rendererLifecycle === "priming" && this.primingStartedAt > 0
            ? nowMs() - this.primingStartedAt
            : 0,
        minFrames: RENDERER_PRIMING_MIN_FRAMES,
        minMs: RENDERER_PRIMING_MIN_MS,
        maxMs: RENDERER_PRIMING_MAX_MS,
      },
      pendingSimulationStart: this.pendingSimulationStart,
      selectedIds: this.debugSelectedIds(),
      hoveredId: this.hoveredId,
      hoverEmphasisIds: this.debugHoverEmphasisIds(),
      hoverEmphasisEdgeCount: this.debugHoverEmphasisEdgeCount(),
      representationMode: {
        requested: this.representationMode,
        applied: this.appliedRepresentationMode,
        staticLayout: this.staticLayoutActive,
      },
      temporal: this.debugTemporalStats(),
      cosmosConfig: { ...this.cosmosConfig },
      pointSizeStats: this.debugPointSizeStats(),
      points,
    };
  }

  private debugHoverEmphasisIds(): string[] {
    return [...this.hoverEmphasisIds].filter((id) => this.idToIndex.has(id));
  }

  private debugHoverEmphasisEdgeCount(): number {
    if (this.hoverEmphasisIds.size === 0) return 0;
    let count = 0;
    for (const [src, dst] of this.linkEndpointIds) {
      if (this.hoverEmphasisIds.has(src) || this.hoverEmphasisIds.has(dst)) {
        count += 1;
      }
    }
    return count;
  }

  private debugPointSizeStats(): PointSizeStats {
    const scale = this.cosmosConfig.pointSizeScale;
    const effectiveAvg = this.pointSizeStats.avg * scale;
    return {
      ...this.pointSizeStats,
      effectiveMin: this.pointSizeStats.min * scale,
      effectiveMax: this.pointSizeStats.max * scale,
      effectiveAvg,
      linkDistanceToEffectiveAvg:
        effectiveAvg > 0 ? this.cosmosConfig.simulationLinkDistance / effectiveAvg : 0,
    };
  }

  private debugTemporalStats(): {
    bucketCount: number;
    nodeCount: number;
    buckets: { key: string; count: number }[];
  } {
    const counts = new Map<string, number>();
    for (const node of this.currentNodes) {
      const key = node.temporal?.bucket;
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const buckets = [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => ({ key, count }));
    return {
      bucketCount: buckets.length,
      nodeCount: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
      buckets,
    };
  }
}
