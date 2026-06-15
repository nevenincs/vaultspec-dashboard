// Main-thread d3-force layout driver (dashboard-node-graph-stability ADR).
//
// Replaces the graphology ForceAtlas2 web worker. d3-force is the documented
// model behind Obsidian's graph and ships the lifecycle the parity bar needs
// natively: alpha cooling (settle-then-freeze), warm-start, fx/fy pinning, and
// jiggle (1e-6) singularity safety inside its core forces. The simulation runs
// on the main thread because connectivity slices are LOD-bounded (hundreds of
// nodes — a d3-force tick costs well under a millisecond there); this retires
// the worker re-entry race and gives immediate drag-to-pin response.
//
// The FieldLayout interface (init/start/stop/setParams/onPositions/positions/
// destroy + setPinned/onSettle) is the layout seam the field assembly drives;
// only the implementation behind it changed from a worker wrapper to this
// driver. Scene-layer module: framework-free by design.

import {
  forceCenter as _unusedForceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";

import { logger } from "../../platform/logger/logger";
import type { NodePosition } from "../positionCache";

void _unusedForceCenter; // forceCenter is a translation force; we use forceX/Y gravity.

// --- worker protocol shapes, preserved for the seam --------------------------

export interface LayoutNodeSeed {
  id: string;
  x: number;
  y: number;
}

export interface LayoutEdgeRef {
  id: string;
  src: string;
  dst: string;
}

/**
 * The user-facing layout knobs — the Obsidian knob set. Each maps onto one d3
 * force; the cooling schedule (alpha decay, velocity decay) is intentionally
 * NOT here, because fixing it is what guarantees the layout always settles.
 * All fields optional so callers can send partial updates.
 */
export interface LayoutParams {
  /** Repel force: node repulsion. Stored positive, applied as negative charge. */
  repel?: number;
  /** Link force: spring stiffness pulling linked nodes together. */
  linkForce?: number;
  /** Link distance: spring rest length between linked nodes. */
  linkDistance?: number;
  /** Center force: per-node gravity toward the origin (forceX/forceY strength). */
  center?: number;
}

/** Obsidian-parity starting values (research parameter table, ~12–300 nodes). */
export const LAYOUT_DEFAULTS: Required<LayoutParams> = {
  repel: 120,
  linkForce: 0.4,
  linkDistance: 40,
  center: 0.06,
};

// --- fixed cooling schedule (d3 defaults: the always-settles contract) -------

export const ALPHA_MIN = 0.001;
export const ALPHA_DECAY = 0.0228; // ~300 ticks to settle
export const VELOCITY_DECAY = 0.4;

const COLD_START_ALPHA = 1;
const WARM_START_ALPHA = 0.5;
const PARAM_REHEAT_ALPHA = 0.3;
const PIN_REHEAT_ALPHA = 0.1;

// Charge approximation + non-overlap. The driver has no per-node radius (the
// sprite layer owns sizing), so collision uses a fixed radius that keeps nodes
// from grossly overlapping without fighting the salience-driven sprite size.
const CHARGE_THETA = 0.9;
const CHARGE_DISTANCE_MAX = 500;
const COLLIDE_RADIUS = 18;

// --- warm-start seeding (preserved for incremental adds) ---------------------

export const SEED_JITTER = 24;
export const COLD_START_RADIUS = 400;

/**
 * Seed positions for nodes entering the layout incrementally. Priority: a known
 * position (cache / contract hint) verbatim; else the centroid of positioned
 * neighbors plus deterministic jitter (local perturbation, not global reflow);
 * else a spot near the field centroid. Used by applyChanges; a fresh init lets
 * d3's phyllotaxis spiral seed any node without a warm-start position.
 */
export function seedPositions(
  nodeIds: readonly string[],
  edges: readonly LayoutEdgeRef[],
  known: ReadonlyMap<string, NodePosition>,
  rand: () => number = Math.random,
): Map<string, NodePosition> {
  const out = new Map<string, NodePosition>();
  let cx = 0;
  let cy = 0;
  if (known.size > 0) {
    for (const p of known.values()) {
      cx += p.x;
      cy += p.y;
    }
    cx /= known.size;
    cy /= known.size;
  }
  const jitter = () => (rand() * 2 - 1) * SEED_JITTER;
  for (const id of nodeIds) {
    const existing = known.get(id);
    if (existing) {
      out.set(id, existing);
      continue;
    }
    let nx = 0;
    let ny = 0;
    let n = 0;
    for (const e of edges) {
      const other = e.src === id ? e.dst : e.dst === id ? e.src : null;
      if (!other) continue;
      const p = known.get(other) ?? out.get(other);
      if (!p) continue;
      nx += p.x;
      ny += p.y;
      n += 1;
    }
    if (n > 0) {
      out.set(id, { x: nx / n + jitter(), y: ny / n + jitter() });
    } else if (known.size > 0) {
      out.set(id, { x: cx + jitter() * 4, y: cy + jitter() * 4 });
    } else {
      out.set(id, {
        x: (rand() * 2 - 1) * COLD_START_RADIUS,
        y: (rand() * 2 - 1) * COLD_START_RADIUS,
      });
    }
  }
  return out;
}

// --- the main-thread driver --------------------------------------------------

export type PositionsListener = (positions: ReadonlyMap<string, NodePosition>) => void;
export type SettleListener = () => void;

interface SimNode {
  id: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}
interface SimLink {
  id: string;
  source: string | SimNode;
  target: string | SimNode;
}

/** Frame scheduler — injectable so tests drive ticks deterministically. */
export interface FrameScheduler {
  schedule(cb: () => void): number;
  cancel(id: number): void;
}

function defaultScheduler(): FrameScheduler {
  if (typeof requestAnimationFrame === "function") {
    return {
      schedule: (cb) => requestAnimationFrame(cb),
      cancel: (id) => cancelAnimationFrame(id),
    };
  }
  return {
    schedule: (cb) => setTimeout(cb, 16) as unknown as number,
    cancel: (id) => clearTimeout(id),
  };
}

const log = logger.child("scene.force-layout");

export class FieldLayout {
  private sim: Simulation<SimNode, SimLink>;
  private linkForce = forceLink<SimNode, SimLink>([]).id((d) => d.id);
  private chargeForce = forceManyBody<SimNode>();
  private xForce = forceX<SimNode>(0);
  private yForce = forceY<SimNode>(0);
  private collideForce = forceCollide<SimNode>(COLLIDE_RADIUS);

  private nodes: SimNode[] = [];
  private nodeById = new Map<string, SimNode>();
  private params: Required<LayoutParams> = { ...LAYOUT_DEFAULTS };
  private pinned = new Set<string>();
  private latest = new Map<string, NodePosition>();
  private listeners = new Set<PositionsListener>();
  private settleListeners = new Set<SettleListener>();

  private running = false;
  private frameId: number | null = null;
  private startAlpha = COLD_START_ALPHA;
  private scheduler: FrameScheduler;

  constructor(scheduler: FrameScheduler = defaultScheduler()) {
    this.scheduler = scheduler;
    // Created stopped: only our manual loop ticks the simulation, so the layout
    // is fully deterministic and never double-driven by d3's internal timer.
    this.sim = forceSimulation<SimNode, SimLink>([])
      .force("charge", this.chargeForce)
      .force("link", this.linkForce)
      .force("x", this.xForce)
      .force("y", this.yForce)
      .force("collide", this.collideForce)
      .alphaMin(ALPHA_MIN)
      .alphaDecay(ALPHA_DECAY)
      .velocityDecay(VELOCITY_DECAY)
      .stop();
    this.applyParams();
  }

  private applyParams(): void {
    this.chargeForce
      .strength(-this.params.repel)
      .theta(CHARGE_THETA)
      .distanceMax(CHARGE_DISTANCE_MAX);
    this.linkForce.distance(this.params.linkDistance).strength(this.params.linkForce);
    this.xForce.strength(this.params.center);
    this.yForce.strength(this.params.center);
  }

  /**
   * (Re)initialize the simulation. Warm-started nodes keep their positions
   * verbatim; nodes without one are left for d3's phyllotaxis spiral (never the
   * origin). Always stop-first so a re-seed can never race an in-flight loop.
   */
  init(
    nodeIds: readonly string[],
    edges: readonly LayoutEdgeRef[],
    warmStart: ReadonlyMap<string, NodePosition>,
  ): void {
    this.stop();
    const present = new Set(nodeIds);
    let warmCount = 0;
    this.nodes = nodeIds.map((id) => {
      const node: SimNode = { id };
      const known = warmStart.get(id);
      if (known) {
        node.x = known.x;
        node.y = known.y;
        warmCount += 1;
      }
      if (this.pinned.has(id) && known) {
        node.fx = known.x;
        node.fy = known.y;
      }
      return node;
    });
    this.nodeById = new Map(this.nodes.map((n) => [n.id, n]));
    // d3 forceLink throws on a link to an unknown node — keep only intra-set edges.
    const links: SimLink[] = edges
      .filter((e) => present.has(e.src) && present.has(e.dst))
      .map((e) => ({ id: e.id, source: e.src, target: e.dst }));
    this.sim.nodes(this.nodes);
    this.linkForce.links(links);
    this.startAlpha =
      nodeIds.length > 0 && warmCount / nodeIds.length > 0.5
        ? WARM_START_ALPHA
        : COLD_START_ALPHA;
    // Emit a seed frame so consumers can frame the initial spread before the
    // first tick (d3 has assigned phyllotaxis coords to unseeded nodes here).
    this.snapshot();
    this.emitPositions();
  }

  /** Start (or reheat to) a fresh settle from the current positions. */
  start(): void {
    this.sim.alpha(this.startAlpha).alphaTarget(0);
    if (!this.running) {
      this.running = true;
      this.scheduleNext();
    }
  }

  /** Halt the settle loop; positions freeze where they are. */
  stop(): void {
    this.running = false;
    if (this.frameId !== null) {
      this.scheduler.cancel(this.frameId);
      this.frameId = null;
    }
    this.sim.stop();
  }

  private scheduleNext(): void {
    this.frameId = this.scheduler.schedule(this.frame);
  }

  private frame = (): void => {
    if (!this.running) return;
    this.frameId = null;
    try {
      this.sim.tick();
    } catch (err) {
      // A solver throw must never wedge the loop silently.
      log.error(`simulation tick threw: ${(err as Error).message}`);
    }
    this.snapshot();
    this.emitPositions();
    // A listener may have synchronously stopped or re-initialized the layout
    // during the fan-out; if so, do not re-arm the loop against that intent.
    if (!this.running) return;
    if (this.sim.alpha() < ALPHA_MIN) {
      this.running = false;
      this.emitSettle();
      return;
    }
    this.scheduleNext();
  };

  /** Read node coords into the snapshot, repairing any non-finite value (D4). */
  private snapshot(): void {
    const next = new Map<string, NodePosition>();
    for (const node of this.nodes) {
      let x = node.x ?? 0;
      let y = node.y ?? 0;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        // d3's jiggle makes this rare, but a single NaN must never reach the
        // camera/hit-index. Fall back to the last good value and reset the node.
        const prev = this.latest.get(node.id);
        x = prev ? prev.x : 0;
        y = prev ? prev.y : 0;
        node.x = x;
        node.y = y;
        node.vx = 0;
        node.vy = 0;
      }
      next.set(node.id, { x, y });
    }
    this.latest = next;
  }

  private emitPositions(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.latest);
      } catch (err) {
        log.error(`positions listener threw: ${(err as Error).message}`);
      }
    }
  }

  private emitSettle(): void {
    for (const listener of this.settleListeners) {
      try {
        listener();
      } catch (err) {
        log.error(`settle listener threw: ${(err as Error).message}`);
      }
    }
  }

  /** Apply updated layout params and reheat so the change is visible. */
  setParams(params: LayoutParams): void {
    this.params = { ...this.params, ...params };
    this.applyParams();
    this.sim.alpha(Math.max(this.sim.alpha(), PARAM_REHEAT_ALPHA)).alphaTarget(0);
    if (!this.running) {
      this.running = true;
      this.scheduleNext();
    }
  }

  /**
   * Solver-level pinning: a pinned node fixes its coordinates in the simulation
   * itself (fx/fy), so the solver holds it and nothing fights. Replaces the
   * display-overwrite of the authoritative frame.
   */
  setPinned(ids: ReadonlySet<string>): void {
    this.pinned = new Set(ids);
    for (const node of this.nodes) {
      if (this.pinned.has(node.id)) {
        node.fx = node.x ?? 0;
        node.fy = node.y ?? 0;
      } else {
        node.fx = null;
        node.fy = null;
      }
    }
    this.sim.alpha(Math.max(this.sim.alpha(), PIN_REHEAT_ALPHA)).alphaTarget(0);
    if (!this.running && this.nodes.length > 0) {
      this.running = true;
      this.scheduleNext();
    }
  }

  /** Incremental graph change with local perturbation: only new nodes seed. */
  applyChanges(
    change: {
      addNodeIds?: readonly string[];
      removeNodeIds?: readonly string[];
      addEdges?: LayoutEdgeRef[];
      removeEdgeIds?: readonly string[];
    },
    rand?: () => number,
  ): void {
    const removeNodes = new Set(change.removeNodeIds ?? []);
    if (removeNodes.size > 0) {
      this.nodes = this.nodes.filter((n) => !removeNodes.has(n.id));
    }
    const addIds = change.addNodeIds ?? [];
    if (addIds.length > 0) {
      const seeds = seedPositions(addIds, change.addEdges ?? [], this.latest, rand);
      for (const id of addIds) {
        if (this.nodeById.has(id)) continue;
        const p = seeds.get(id)!;
        const node: SimNode = { id, x: p.x, y: p.y };
        this.nodes.push(node);
      }
    }
    this.nodeById = new Map(this.nodes.map((n) => [n.id, n]));
    const present = new Set(this.nodeById.keys());
    const removeEdges = new Set(change.removeEdgeIds ?? []);
    const links = (this.linkForce.links() as SimLink[])
      .filter((l) => !removeEdges.has(l.id))
      .map((l) => ({
        id: l.id,
        source: typeof l.source === "string" ? l.source : l.source.id,
        target: typeof l.target === "string" ? l.target : l.target.id,
      }))
      .concat(
        (change.addEdges ?? []).map((e) => ({
          id: e.id,
          source: e.src,
          target: e.dst,
        })),
      )
      .filter((l) => present.has(l.source) && present.has(l.target));
    this.sim.nodes(this.nodes);
    this.linkForce.links(links);
    this.startAlpha = WARM_START_ALPHA;
    this.start();
  }

  /** Latest position frame (for the field assembly and the warm-start cache). */
  get positions(): ReadonlyMap<string, NodePosition> {
    return this.latest;
  }

  onPositions(listener: PositionsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Fires once when the simulation cools to a freeze (drives fit-once). */
  onSettle(listener: SettleListener): () => void {
    this.settleListeners.add(listener);
    return () => this.settleListeners.delete(listener);
  }

  destroy(): void {
    this.stop();
    this.listeners.clear();
    this.settleListeners.clear();
  }
}
