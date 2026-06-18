// cosmos.gl-backed scene field — node-graph-rework ADR (D1/D2/D3).
//
// Cosmos owns the live simulation and drag lifecycle. The scene uploads graph data
// on topology changes, then controls Cosmos through its documented simulation API
// (start/pause/unpause/stop + setConfig). It must not push point positions every
// frame: Cosmos' render/update path clears hover state, so per-tick external
// uploads break pointer interactivity.
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
  SceneCommand,
  SceneController,
  SceneEdgeData,
  SceneFieldRenderer,
  SceneNodeData,
} from "../sceneController";
import { EDGE_RENDER_DEFAULTS } from "../sceneController";
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
import { SALIENCE_RADIUS_MAX } from "./nodeSprites";
import { cssColorNumber } from "./tokenReads";

/** The ONLY cosmos internal we reach for: stopFrames() halts the perpetual rAF
 *  render loop so the GPU truly idles. There is no public equivalent —
 *  start/pause/unpause only flip the simulation flag; only render() (re)starts
 *  frames and only stopFrames()/destroy() halt them. Everything else uses the
 *  public Graph API. */
type CosmosRuntimeGraph = {
  stopFrames?: () => void;
};

/** Cosmos world-space size: sizes the position texture and screen mapping. */
const SPACE_SIZE = 8192;
const SPACE_CENTRE = SPACE_SIZE / 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Fallback node diameter when no per-node radius is known (auto-sizing a bound). */
const FALLBACK_DIAMETER = 68;
const COSMOS_POINT_SIZE = 4;
const HOVER_RECEDING_POINT_ALPHA = 0.18;
const HOVER_RECEDING_LINK_ALPHA = 0.04;
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
  }
  for (const n of nodes) {
    if (n.seedPosition) {
      mix(
        `${Math.round(n.seedPosition.x * 100) / 100}:${Math.round(n.seedPosition.y * 100) / 100}`,
      );
    }
  }
  for (const e of edges) {
    mixInt(idIndex.get(e.src) ?? -1);
    mixInt(idIndex.get(e.dst) ?? -1);
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
  private basePointColors = new Float32Array();
  private baseLinkColors = new Float32Array();
  /** Retained hover-dim buffers, reused across hovers (sized at set-data). Mutating
   *  these in place avoids allocating a fresh full-graph colour array on every
   *  hovered-node change — the GC churn that made hover janky at 37k links. */
  private displayPointBuf = new Float32Array();
  private displayLinkBuf = new Float32Array();
  private linkEndpointIds: [string, string][] = [];
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
   *  loop renders every frame forever once started; we halt it (stopFrames) when the
   *  sim has settled AND the pointer is off the canvas, and wake it (render) on
   *  pointer-enter, interaction, camera moves, and data/config changes. Hover
   *  detection lives in the loop, so we only idle while the pointer is away. */
  private renderLoopIdle = false;
  private pointerOver = false;
  private idleTimer: number | null = null;
  private pointerHandlers: { enter: () => void; leave: () => void } | null = null;
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
      enableSimulation: true,
      rescalePositions: false,
      ...this.cosmosForceConfig(),
      // ---- interaction (live) ---------------------------------------------
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
      linkGreyoutOpacity: 0.04,
      linkVisibilityDistanceRange: [5, 6000],
      hoveredLinkColor: hexString("--color-accent", 0x8a7d5a),
      focusedPointRingColor: hexString("--color-accent", 0x8a7d5a),
      onClick: (index) => {
        const id = index === undefined ? null : (this.indexToId[index] ?? null);
        this.controller?.emit({ kind: "select", id });
      },
      onPointMouseOver: (index) => {
        const id = this.indexToId[index] ?? null;
        this.setHoverEmphasis(id);
        this.controller?.emit({ kind: "hover", id });
      },
      onPointMouseOut: () => {
        this.setHoverEmphasis(null);
        this.controller?.emit({ kind: "hover", id: null });
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
        if (this.rendererLifecycle === "simulating") {
          this.setRendererLifecycle("ready", "simulation-end");
        }
        // Settled: let the GPU idle once the pointer is also away.
        this.scheduleIdle();
      },
    });

    // Render-on-demand idle: keep frames alive while the pointer is over the canvas
    // (cosmos detects hover inside the loop), idle shortly after it leaves.
    const enter = (): void => {
      this.pointerOver = true;
      this.ensureRenderLoop();
    };
    const leave = (): void => {
      this.pointerOver = false;
      this.scheduleIdle();
    };
    container.addEventListener("pointerenter", enter);
    container.addEventListener("pointermove", enter);
    container.addEventListener("wheel", enter, { passive: true });
    container.addEventListener("pointerleave", leave);
    this.pointerHandlers = { enter, leave };
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

  /** Idle the GPU only when the sim has settled, the pointer is off the canvas, and
   *  no interaction/upload is in flight. Pointer-over keeps frames alive because
   *  cosmos's hover detection runs inside the loop. */
  private maybeIdle(): void {
    if (!this.graph || this.renderLoopIdle) return;
    if (this.pointerOver || this.interacting) return;
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
      this.graph.fitView(200, 0.25);
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
          this.graph.zoomToPointByIndex(i);
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
        this.graph.fitView(400);
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
      // visibility, representation mode, time, overlays, deltas land next.
    }
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
    this.startCosmosSimulation("param");
  }

  private setSimulationActive(active: boolean): void {
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
    this.startCosmosSimulation("pin");
  }

  /** The shared selection (set-selected): ring the first selected node present in
   *  the current slice. cosmos's focused-point ring is the on-canvas selection. */
  private setSelected(ids: ReadonlySet<string>): void {
    this.selectedIds = new Set(ids);
    this.applySelectedState();
  }

  private applySelectedState(): void {
    if (!this.graph) return;
    const selectedIndices: number[] = [];
    let focused: number | undefined;
    for (const id of this.selectedIds) {
      const i = this.idToIndex.get(id);
      if (i !== undefined) {
        selectedIndices.push(i);
        focused ??= i;
      }
    }
    if (selectedIndices.length > 0) {
      this.graph.selectPointsByIndices(selectedIndices);
    } else {
      this.graph.unselectPoints();
    }
    this.graph.setConfig({ focusedPointIndex: focused });
    // Selection/focus only paints on the next frame; wake the loop if idled, then
    // let it settle back to idle.
    this.ensureRenderLoop();
    this.scheduleIdle();
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
    this.applyHoverEmphasisColors(true);
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

  private displayPointColors(): Float32Array {
    if (this.hoverEmphasisIds.size === 0) return this.basePointColors;
    if (this.displayPointBuf.length !== this.basePointColors.length) {
      this.displayPointBuf = new Float32Array(this.basePointColors.length);
    }
    const colors = this.displayPointBuf;
    colors.set(this.basePointColors);
    for (let i = 0; i < this.indexToId.length; i += 1) {
      const id = this.indexToId[i];
      if (!id || this.hoverEmphasisIds.has(id)) continue;
      colors[i * 4 + 3] = Math.min(colors[i * 4 + 3], HOVER_RECEDING_POINT_ALPHA);
    }
    return colors;
  }

  private displayLinkColors(): Float32Array {
    if (this.hoverEmphasisIds.size === 0) return this.baseLinkColors;
    if (this.displayLinkBuf.length !== this.baseLinkColors.length) {
      this.displayLinkBuf = new Float32Array(this.baseLinkColors.length);
    }
    const colors = this.displayLinkBuf;
    colors.set(this.baseLinkColors);
    for (let i = 0; i < this.linkEndpointIds.length; i += 1) {
      const [src, dst] = this.linkEndpointIds[i];
      if (this.hoverEmphasisIds.has(src) || this.hoverEmphasisIds.has(dst)) continue;
      colors[i * 4 + 3] = Math.min(colors[i * 4 + 3], HOVER_RECEDING_LINK_ALPHA);
    }
    return colors;
  }

  private applyHoverEmphasisColors(render = false): void {
    if (!this.graph) return;
    if (this.basePointColors.length > 0) {
      this.graph.setPointColors(this.displayPointColors());
    }
    if (this.baseLinkColors.length > 0) {
      this.graph.setLinkColors(this.displayLinkColors());
    }
    if (render) this.renderField();
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
      this.basePointColors = new Float32Array();
      this.baseLinkColors = new Float32Array();
      this.linkEndpointIds = [];
      this.tagToNodeIds.clear();
      this.simulationStarted = false;
      this.pendingSimulationStart = null;
      this.graph.setPointPositions(new Float32Array(), true);
      this.graph.setLinks(new Float32Array());
      this.renderField(0);
      this.applySelectedState();
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
      const ap = edgeAppearance(e, tierColors);
      linkColors.push(ap.r, ap.g, ap.b, ap.a);
      linkWidths.push(ap.width);
    }
    this.droppedEdges = dropped;
    this.basePointColors = colors;
    this.baseLinkColors = new Float32Array(linkColors);
    this.linkEndpointIds = linkEndpointIds;
    this.rebuildTagIndex();
    this.refreshHoverEmphasis();

    const shouldAutoFitOpening = count > 0 && this.fitPending;

    // Cosmos data upload: topology/appearance change only. Live movement after
    // this point is Cosmos' simulation loop, not an external per-frame upload.
    this.graph.setPointPositions(positions, true);
    this.graph.setPointColors(this.displayPointColors());
    this.graph.setPointSizes(sizes);
    this.graph.setLinks(new Float32Array(linkList));
    this.graph.setLinkColors(this.displayLinkColors());
    this.graph.setLinkWidths(new Float32Array(linkWidths));
    this.applyCosmosForceConfig();
    this.renderField(0);
    this.applySelectedState();
    if (shouldAutoFitOpening) this.armOpeningAutoFit();
    if (this.staticLayoutActive) {
      this.pendingSimulationStart = null;
      this.graph.pause();
      this.setRendererLifecycle("static-ready", "static-layout");
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
    // getPointPositions() returns a number[]; wrap it as a Float32Array to mutate.
    const positions = new Float32Array(this.graph.getPointPositions());
    this.applyRepresentationPositions(positions);
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
    if (positions.length > 0) {
      this.graph.setPointPositions(positions, true);
      this.renderField(0);
    }
    if (this.staticLayoutActive) {
      this.simulationRequested = false;
      this.simulationStarted = false;
      this.pendingSimulationStart = null;
      this.graph.pause();
      this.scheduleIdle();
    } else {
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
      this.container.removeEventListener("pointermove", this.pointerHandlers.enter);
      this.container.removeEventListener("wheel", this.pointerHandlers.enter);
      this.container.removeEventListener("pointerleave", this.pointerHandlers.leave);
    }
    this.pointerHandlers = null;
    this.renderLoopIdle = false;
    this.pointerOver = false;
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
    this.displayPointBuf = new Float32Array();
    this.displayLinkBuf = new Float32Array();
    this.linkEndpointIds = [];
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
