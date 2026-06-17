// Main-thread d3-force layout driver (dashboard-node-graph-stability ADR;
// graph-force-stability ADR D1/D2/D4/D5).
//
// Replaces the graphology ForceAtlas2 web worker. d3-force is the documented
// model behind Obsidian's graph and ships the lifecycle the parity bar needs
// natively: alpha cooling (settle-then-freeze), warm-start, fx/fy pinning, and
// jiggle (1e-6) singularity safety inside its core forces. The simulation runs
// on the main thread because connectivity slices are LOD-bounded (hundreds of
// nodes — a d3-force tick costs well under a millisecond there); this retires
// the worker re-entry race and gives immediate drag-to-pin response.
//
// graph-force-stability extends the driver in three places, all keeping the
// fixed cooling schedule untouched (force-layout-cooling-is-fixed-never-exposed):
//   - the held-warmth interaction seam: beginInteraction/endInteraction set and
//     clear an interaction alphaTarget floor so a slider-tune or a node-drag
//     keeps the field gently warm and reflows around the change instead of
//     lurching from a one-shot reheat kick (D2);
//   - per-node collision through an assembly-owned radiusOf(id) callback so the
//     driver stays render-agnostic — no nodeRadius import, no radius-map snapshot
//     (D4); a fixed-radius fallback when the callback is absent;
//   - an early settle-freeze on a velocity/dwell threshold (node-count-scaled
//     dwell) that stops the SIM, not just the draw, atop the alpha-floor backstop
//     (D5). dragNode sets fx/fy under the held interaction target for drag-to-pin
//     (D3, driven by the assembly's gesture callbacks).
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
 *
 * Binding Tune-control contract (figma-parity-reconciliation W03.P09.S54,
 * `graph/Controls` 88:2): the plain-language Tune sliders map ONE-TO-ONE onto
 * these driver knobs, so the binding control exposes only knobs the driver
 * actually has (no dead controls):
 *   - "Spacing"          -> `repel`        (node repulsion; higher = more space)
 *   - "Connection reach" -> `linkDistance` (spring rest length between linked nodes)
 *   - "Clustering"       -> `linkForce`    (spring stiffness; higher = tighter groups)
 * `center` (per-node gravity) has NO plain-language slot in the binding design and
 * is held at its default by the Tune control — it stays a driver knob for internal
 * use but is intentionally not surfaced (a UI gap recorded in F4, not a dead
 * control). The mapping lives here so the driver is the single source of truth for
 * the binding Tune control's contract.
 */
export interface LayoutParams {
  /** Binding "Spacing": node repulsion. Stored positive, applied as negative charge. */
  repel?: number;
  /** Binding "Clustering": spring stiffness pulling linked nodes together. */
  linkForce?: number;
  /** Binding "Connection reach": spring rest length between linked nodes. */
  linkDistance?: number;
  /** Center force: per-node gravity toward the origin (forceX/forceY strength).
   *  Not surfaced by the binding Tune control; held at its default. */
  center?: number;
}

/**
 * Obsidian-parity starting values (research parameter table, ~12–300 nodes), and
 * the binding Tune control's slider start positions (Spacing/Connection-reach/
 * Clustering). DELIBERATELY UNCHANGED in W03.P09.S54: these defaults seed the
 * scene-layer layout-quality calibration (the scorecard property/perturbation
 * gates run the driver at these values), so the binding Tune control is mapped
 * onto the driver WITHOUT re-tuning the defaults — the knob mapping is the
 * deliverable, not a new default field.
 */
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

/**
 * Incremental-reheat alpha (graph-force-stability D1). A content delta — a live
 * keyframe or a working-set expansion that only ADDS/REMOVES nodes around a
 * surviving set — perturbs the field at this LOW alpha with every survivor's
 * position preserved, instead of re-settling the whole field from warm/cold.
 * This is the dominant flicker fix (R1). Tuned empirically (see below): at 0.15
 * the field nudges the new nodes into place and re-cools within ~80 ticks on the
 * 12/50/300-node slices without visibly shuffling the survivors; 0.3 (the old
 * warm-ish ceiling on applyChanges) re-shuffled the whole field, 0.05 left added
 * nodes stranded at their seed for the 300-node slice.
 */
export const INCREMENTAL_REHEAT_ALPHA = 0.15;

/**
 * Interaction-active alphaTarget floor (graph-force-stability D2). While a
 * slider-drag or a node-drag is active, the field breathes against this floor
 * instead of cooling to a freeze, so a parameter change is applied continuously
 * and the field reflows around it. Cleared back to 0 on endInteraction so the
 * field re-cools normally. This is an INTERACTION floor, not a cooling-schedule
 * knob — alphaDecay/velocityDecay/alphaMin stay fixed. Tuned empirically: 0.1
 * keeps the field perceptibly live during a drag (matches d3/Obsidian's drag
 * reheat) without the whole field racing; 0.3 felt like a re-settle, 0.05 barely
 * moved neighbours under a node-drag.
 */
export const INTERACTION_ALPHA_TARGET = 0.1;

// Charge approximation + non-overlap. Per-node collision (D4) is supplied by an
// assembly-owned radiusOf(id) callback that shares the salience-driven sprite
// radius; the driver stays render-agnostic. When the callback is absent (tests,
// deterministic modes) the fixed FALLBACK_COLLIDE_RADIUS keeps nodes from grossly
// overlapping without fighting the sprite size.
const CHARGE_THETA = 0.9;
const CHARGE_DISTANCE_MAX = 500;
const FALLBACK_COLLIDE_RADIUS = 18;

// --- early settle-freeze (graph-force-stability D5) --------------------------
//
// The alpha-floor freeze (alpha < ALPHA_MIN) is the HARD backstop. Above it, the
// driver freezes the SIM early once motion has genuinely stopped: when the
// maximum per-node displacement between ticks stays below FREEZE_MOVE_EPSILON for
// FREEZE_DWELL_TICKS consecutive ticks. The dwell SCALES with node count so a
// large, slow-converging island is not frozen prematurely, and the dwell counter
// RESETS the instant any node exceeds the epsilon — so one far island still
// drifting (under distanceMax clipping, R6) keeps the whole field warm until it
// too settles, and the field can neither false-freeze while one node wanders nor
// spin sub-epsilon forever once all motion stops.
//
// Tuned empirically against the 12/50/300-node slices in the live loop:
//   - FREEZE_MOVE_EPSILON 0.5 sits just above the MOVE_EPSILON render gate (0.4)
//     so the sim freezes right after the draw stops updating, not before;
//   - K=40 gives dwell 12→DWELL_MIN(10) for the small slice, ~10 for 50 nodes,
//     ~8→clamped... no: round(300/40)=8 → clamped up to DWELL_MIN(10) only if
//     below; 300/40=7.5→8, so the band DWELL_MIN..DWELL_MAX (10..45) holds the
//     dwell at 10 for small/medium and lets it grow for very large islands;
//   - the freeze fires ~15-40 ticks before the alpha floor on a converged slice,
//     cutting the sub-epsilon tail the old gate only suppressed at the draw.
export const FREEZE_MOVE_EPSILON = 0.5;
export const FREEZE_DWELL_MIN = 10;
export const FREEZE_DWELL_MAX = 45;
export const FREEZE_DWELL_K = 40;
/**
 * Fraction of nodes allowed to still exceed FREEZE_MOVE_EPSILON while the field
 * is considered calm enough to freeze (D5). A handful of nodes can oscillate
 * indefinitely under collision between packed neighbours; requiring EVERY node
 * sub-epsilon meant a large field never early-froze. 3% (floored) tolerates ~2
 * stragglers on a 68-node field and 0 on a tiny one, so small graphs still need
 * full calm while large ones freeze once the body has stopped. The alpha floor
 * remains the hard backstop for the stragglers' residual motion.
 */
export const FREEZE_OUTLIER_FRACTION = 0.03;

/**
 * Alpha-ceiling early freeze (D5). Below this alpha the force magnitudes are a
 * few percent of a cold start, so residual per-tick motion is visually
 * negligible — the layout is essentially settled. A LARGE field never fully
 * velocity-calms (its body keeps drifting sub-perceptibly all the way to the
 * alpha floor, ~300 ticks / ~5s of on-load jitter — the dominant flicker), so
 * this caps settle time for every field size at the point the motion stops
 * mattering. Small fields velocity-calm ABOVE this alpha and freeze earlier, so
 * this never makes a small graph wait — it only stops a large one from grinding
 * the long sub-perceptible tail. The alpha floor (ALPHA_MIN) remains the ultimate
 * backstop.
 */
export const FREEZE_ALPHA_CEILING = 0.03;

/** Node-count-scaled dwell: clamp(round(n / K), MIN, MAX) (D5). */
export function freezeDwellTicks(nodeCount: number): number {
  const scaled = Math.round(nodeCount / FREEZE_DWELL_K);
  return Math.max(FREEZE_DWELL_MIN, Math.min(FREEZE_DWELL_MAX, scaled));
}

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

/**
 * Per-node collision radius callback (graph-force-stability D4). The assembly
 * owns it (`radiusOf = (id) => nodeRadius(model.nodeById(id)) + COLLIDE_PAD`) so
 * the driver shares the salience-driven sprite radius WITHOUT importing
 * nodeRadius or holding a render-derived radius snapshot. Absent on tests and
 * deterministic modes, where the fixed fallback radius is used.
 */
export type RadiusOf = (id: string) => number;

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
  private collideForce = forceCollide<SimNode>(FALLBACK_COLLIDE_RADIUS);

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

  /** Per-node collision radius callback (D4); null falls back to the fixed radius. */
  private radiusOf: RadiusOf | null = null;
  /** Interaction-active flag (D2): held alphaTarget + setParams skips the kick. */
  private interacting = false;
  /** Consecutive sub-epsilon ticks for the early settle-freeze (D5). */
  private dwell = 0;
  /** Survivors temporarily fixed (fx/fy) for the duration of an add-reheat so only
   *  the newly added nodes settle (object constancy). Released the instant the field
   *  freezes — see `releaseAddReheatPins`. Never includes a real (user) pin. */
  private addReheatPinned = new Set<string>();

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
    // Radius-aware link rest length: the spring pulls linked nodes to
    // `linkDistance` of CLEAR GAP between their bodies, not 40 units centre-to-
    // centre. Without this, salience/member-count-scaled bodies (feature
    // convergence discs reach ~33px radius, nodeSprites.nodeRadius) collapse into
    // an overlapping hairball — 1120 springs at a flat 40-unit rest length pull
    // 33px-radius discs to 40-unit centres, far inside their own bodies, and the
    // soft single-iteration collide cannot recover it. Summing the endpoint radii
    // is the standard d3 treatment for variable-size nodes and is what lets the
    // thin grey connection rule read in the gaps between discs (Obsidian parity).
    const r = this.radiusOf;
    const rest = this.params.linkDistance;
    // When the assembly supplies a per-node radius (the live product path), the
    // rest length is the CLEAR GAP plus both bodies, so sized discs never collapse
    // inside one another. When it does not (unit tests / the layout-quality
    // scorecard run on uniform synthetic nodes), keep the exact flat rest length
    // so the calibrated quality baseline is unchanged — the radius term is a no-op
    // there and only the real, variable-size graph gets the Obsidian-parity spacing.
    this.linkForce
      .distance(
        r
          ? (l: SimLink) =>
              rest + r((l.source as SimNode).id) + r((l.target as SimNode).id)
          : rest,
      )
      .strength(this.params.linkForce);
    this.xForce.strength(this.params.center);
    this.yForce.strength(this.params.center);
  }

  /**
   * Per-node collision radius (D4): the assembly-owned callback tracks the
   * salience-driven sprite body; absent, every node uses the fixed fallback so
   * the driver stays usable in tests and deterministic modes.
   */
  private applyCollideRadius(): void {
    const r = this.radiusOf;
    if (r) {
      this.collideForce.radius((d: SimNode) => r(d.id));
    } else {
      this.collideForce.radius(FALLBACK_COLLIDE_RADIUS);
    }
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
    radiusOf?: RadiusOf | null,
  ): void {
    this.stop();
    if (radiusOf !== undefined) {
      this.radiusOf = radiusOf;
      this.applyCollideRadius();
    }
    this.dwell = 0;
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
    // Honor a held interaction floor: a start() during interaction (e.g. a node
    // dragged into the field) keeps breathing against the target rather than
    // cooling to a freeze (D2).
    this.sim
      .alpha(this.startAlpha)
      .alphaTarget(this.interacting ? INTERACTION_ALPHA_TARGET : 0);
    this.dwell = 0;
    if (!this.running) {
      this.running = true;
      this.scheduleNext();
    }
  }

  /**
   * Compute the layout to convergence SYNCHRONOUSLY and emit the settled positions
   * once — the canonical d3 pattern (dianaow / Jan Žák force-graph research): the
   * chaotic initial spread is computed OFFLINE, never animated, so the field
   * appears ALREADY SETTLED with no cold-start flicker. This is the routing target
   * for a first-load / reseed connectivity layout; interaction (drag, slider tune,
   * incremental add) still ticks live via start(). Bounded by maxIters so a
   * pathological graph can never block the main thread unboundedly — the bound is
   * generous (d3 reaches alphaMin in ~300 ticks at the fixed decay). The single
   * emitPositions lands the settled frame; because the assembly coalesces renders
   * to one rAF, the intermediate seed frame from init() is overwritten before it
   * ever paints, so there is no seed→settled flash.
   */
  settleOffline(maxIters = 400): void {
    this.stop();
    this.dwell = 0;
    this.sim.alpha(this.startAlpha).alphaTarget(0);
    let iters = 0;
    while (this.sim.alpha() >= ALPHA_MIN && iters < maxIters) {
      try {
        this.sim.tick();
      } catch (err) {
        log.error(`offline settle tick threw: ${(err as Error).message}`);
        break;
      }
      iters += 1;
    }
    this.releaseAddReheatPins();
    this.snapshot();
    this.emitPositions();
    this.emitSettle();
  }

  /**
   * Resume a frozen field at a low alpha (graph-force-stability D7, the freeze
   * toggle's unfreeze). A gentle reheat from the current positions so the field
   * settles again without a cold re-settle. The cooling schedule stays fixed.
   */
  unfreeze(): void {
    this.dwell = 0;
    this.sim.alpha(Math.max(this.sim.alpha(), INCREMENTAL_REHEAT_ALPHA)).alphaTarget(0);
    if (!this.running && this.nodes.length > 0) {
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
    // An external halt (freeze toggle, re-init, mode swap) ends any in-flight
    // add-reheat: release the survivor holds so they are never left fixed.
    this.releaseAddReheatPins();
  }

  private scheduleNext(): void {
    this.frameId = this.scheduler.schedule(this.frame);
  }

  private frame = (): void => {
    if (!this.running) return;
    this.frameId = null;
    // The pre-tick frame, to measure this tick's max per-node displacement for
    // the early settle-freeze (D5).
    const prev = this.latest;
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
    // Hard backstop: the alpha-floor freeze (D5 keeps this as the floor).
    if (this.sim.alpha() < ALPHA_MIN) {
      this.running = false;
      this.releaseAddReheatPins();
      this.emitSettle();
      return;
    }
    // Alpha-ceiling early freeze (D5): once the field is cool enough that residual
    // motion is visually negligible, stop — this bounds the on-load settle time
    // for a large field that never fully velocity-calms (its body would otherwise
    // drift sub-perceptibly all the way to the floor, the long jittery tail). A
    // held interaction suppresses it (a drag keeps the field warm by design).
    if (!this.interacting && this.sim.alpha() < FREEZE_ALPHA_CEILING) {
      this.running = false;
      this.sim.stop();
      this.emitSettle();
      return;
    }
    // Early settle-freeze (D5): stop the SIM once the field is CALM ENOUGH — not
    // when literally every node is sub-epsilon. The old "max displacement < eps"
    // gate meant a SINGLE perpetually-jiggling node (collision oscillation between
    // two packed neighbours is common at scale) reset the dwell forever, so a
    // larger graph never early-froze and ground all the way to the alpha floor —
    // ~5s+ of visible jitter on load (the dominant on-load flicker). Calm-enough
    // tolerates a tiny fraction of outliers still settling, so the field freezes
    // crisply once the BODY of nodes has stopped, exactly like Obsidian. While
    // interacting, the held alphaTarget suppresses the freeze (a held drag must
    // not false-freeze).
    if (!this.interacting && this.fieldIsCalm(prev)) {
      this.dwell += 1;
      if (this.dwell >= freezeDwellTicks(this.nodes.length)) {
        this.running = false;
        this.sim.stop();
        this.releaseAddReheatPins();
        this.emitSettle();
        return;
      }
    } else {
      this.dwell = 0;
    }
    this.scheduleNext();
  };

  /**
   * Whether the field has settled enough to freeze (D5): the number of nodes that
   * moved more than FREEZE_MOVE_EPSILON this tick is within a small outlier
   * tolerance (a fixed fraction of the node count, floored to allow a couple of
   * stragglers on a large field). A freshly added node (absent from `prev`) counts
   * as moving. This converges every graph size in roughly the same wall-clock,
   * instead of letting one oscillating pair hold the whole field warm.
   */
  private fieldIsCalm(prev: ReadonlyMap<string, NodePosition>): boolean {
    const tolerance = Math.floor(this.nodes.length * FREEZE_OUTLIER_FRACTION);
    let moving = 0;
    for (const node of this.nodes) {
      const q = prev.get(node.id);
      if (!q) {
        if (++moving > tolerance) return false;
        continue;
      }
      const dx = (node.x ?? 0) - q.x;
      const dy = (node.y ?? 0) - q.y;
      if (Math.hypot(dx, dy) > FREEZE_MOVE_EPSILON) {
        if (++moving > tolerance) return false;
      }
    }
    return true;
  }

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

  /**
   * Apply updated layout params (D2). DURING an interaction (a slider drag) the
   * held alphaTarget already keeps the field warm, so the param change is applied
   * continuously WITHOUT a one-shot reheat kick — the field reflows around it
   * instead of lurching. Outside an interaction it keeps the one-shot reheat so a
   * keyboard step on a settled field is still visible.
   */
  setParams(params: LayoutParams): void {
    this.params = { ...this.params, ...params };
    this.applyParams();
    if (this.interacting) {
      // Held target keeps the field warm; no kick. Ensure the loop runs so the
      // continuous reflow is visible.
      this.dwell = 0;
      if (!this.running) {
        this.running = true;
        this.scheduleNext();
      }
      return;
    }
    this.sim.alpha(Math.max(this.sim.alpha(), PARAM_REHEAT_ALPHA)).alphaTarget(0);
    this.dwell = 0;
    if (!this.running) {
      this.running = true;
      this.scheduleNext();
    }
  }

  /**
   * Enter an interaction (D2): hold an alphaTarget floor so the field breathes
   * against it — a slider tune (D2) or a node drag (D3) keeps the field warm and
   * reflows continuously instead of re-settling from a kick. Idempotent.
   */
  beginInteraction(): void {
    this.interacting = true;
    this.dwell = 0;
    this.sim.alphaTarget(INTERACTION_ALPHA_TARGET);
    this.sim.alpha(Math.max(this.sim.alpha(), INTERACTION_ALPHA_TARGET));
    if (!this.running) {
      this.running = true;
      this.scheduleNext();
    }
  }

  /**
   * End an interaction (D2): clear the alphaTarget back to 0 and let the field
   * re-cool to a freeze (the velocity-freeze then fires). Idempotent.
   */
  endInteraction(): void {
    if (!this.interacting) return;
    this.interacting = false;
    this.sim.alphaTarget(0);
    this.dwell = 0;
    // Keep the loop running so the re-cool actually happens; if it had stopped
    // (it should not have, the target held it), restart from the current alpha.
    if (!this.running && this.nodes.length > 0) {
      this.running = true;
      this.scheduleNext();
    }
  }

  /**
   * Drag a node to a world position (D3): fix it there via fx/fy and ensure the
   * interaction floor is held so the neighbourhood reflows around the dragged
   * node. The assembly's nodeDragTo gesture callback drives this each move.
   */
  dragNode(id: string, x: number, y: number): void {
    const node = this.nodeById.get(id);
    if (!node) return;
    if (!this.interacting) this.beginInteraction();
    node.fx = x;
    node.fy = y;
    node.x = x;
    node.y = y;
  }

  /**
   * Release a free-dragged node back into the live simulation (the drag DROP).
   * Clears the temporary fx/fy that `dragNode` fixed so the node eases into the
   * cooling layout instead of being stranded where it was dropped — UNLESS the
   * node is an explicitly pinned node (pinning is a separate, deliberate gesture),
   * in which case it keeps its dropped coordinates fixed. This is what makes a
   * drag MOVE a node WITHOUT pinning it. The caller pairs this with
   * `endInteraction()` so the field re-cools around the dropped node.
   */
  releaseNode(id: string): void {
    const node = this.nodeById.get(id);
    if (!node) return;
    if (this.pinned.has(id)) {
      node.fx = node.x ?? null;
      node.fy = node.y ?? null;
    } else {
      node.fx = null;
      node.fy = null;
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
    // Preserve a held interaction floor: a sticky pin recorded mid-interaction
    // (the drag-end path routes through here) must not clobber the held target.
    this.sim
      .alpha(Math.max(this.sim.alpha(), PIN_REHEAT_ALPHA))
      .alphaTarget(this.interacting ? INTERACTION_ALPHA_TARGET : 0);
    if (!this.running && this.nodes.length > 0) {
      this.running = true;
      this.scheduleNext();
    }
  }

  /**
   * Incremental graph change with local perturbation (D1): only new nodes seed,
   * every survivor keeps its position, and the field reheats to the LOW
   * INCREMENTAL_REHEAT_ALPHA — not the warm-start alpha. This is the routing
   * target for live keyframes and working-set expansions: a content delta
   * perturbs the field locally instead of re-settling the whole map (R1).
   */
  applyChanges(
    change: {
      addNodeIds?: readonly string[];
      removeNodeIds?: readonly string[];
      addEdges?: LayoutEdgeRef[];
      removeEdgeIds?: readonly string[];
    },
    rand?: () => number,
    radiusOf?: RadiusOf | null,
  ): void {
    if (radiusOf !== undefined) {
      this.radiusOf = radiusOf;
      this.applyCollideRadius();
    }
    // Object constancy — the dominant stability fix (measured, not assumed). A
    // content delta that changes NO topology (a refetch / live keyframe that
    // restated the SAME nodes+edges, or only updated a scalar like salience /
    // status / degree) must NOT perturb the settled field. Reheating a
    // converged-and-frozen field to even the LOW incremental alpha re-flows EVERY
    // node — measured at 150+ world-units per 100ms for ~1.2s on an UNCHANGED
    // 68-node slice — which is the "flickering bounce on every refresh" the field
    // exhibited. Nothing structural changed, so there is nothing to settle: leave
    // the frozen positions exactly where they are. A real add/remove below still
    // reheats locally.
    const addIds = change.addNodeIds ?? [];
    const removeIds = change.removeNodeIds ?? [];
    if (
      addIds.length === 0 &&
      removeIds.length === 0 &&
      (change.addEdges?.length ?? 0) === 0 &&
      (change.removeEdgeIds?.length ?? 0) === 0
    ) {
      return;
    }
    const removeNodes = new Set(removeIds);
    if (removeNodes.size > 0) {
      this.nodes = this.nodes.filter((n) => !removeNodes.has(n.id));
    }
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
    // A pure REMOVE (no adds) needs no settle: the remaining layout is still
    // converged, so just re-emit the trimmed frame without reheating (no bounce).
    if (addIds.length === 0) {
      this.snapshot();
      this.emitPositions();
      return;
    }
    // Object constancy on ADD: hold every existing survivor FIXED (fx/fy) for the
    // duration of this low-alpha reheat so only the NEW nodes settle into the gaps —
    // the established map does not re-flow around the newcomers (the Obsidian
    // "expand a node" feel). Without this, reheating a non-equilibrium frozen field
    // moves every survivor 200+ world-units (measured). The temporary holds are
    // released the instant the field freezes (releaseAddReheatPins) — never a real pin.
    const added = new Set(addIds);
    this.addReheatPinned.clear();
    for (const node of this.nodes) {
      if (added.has(node.id) || this.pinned.has(node.id)) continue;
      if (node.fx != null || node.fy != null) continue;
      node.fx = node.x ?? 0;
      node.fy = node.y ?? 0;
      this.addReheatPinned.add(node.id);
    }
    // D1: the new nodes reheat to the LOW incremental alpha, not warm-start.
    this.startAlpha = INCREMENTAL_REHEAT_ALPHA;
    this.start();
  }

  /**
   * Release the survivors temporarily fixed for an add-reheat (object constancy):
   * clears the fx/fy `applyChanges` set on them, never touching a real user pin.
   * Called the instant the field freezes so the holds last exactly one settle.
   */
  private releaseAddReheatPins(): void {
    if (this.addReheatPinned.size === 0) return;
    for (const id of this.addReheatPinned) {
      if (this.pinned.has(id)) continue;
      const node = this.nodeById.get(id);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
    }
    this.addReheatPinned.clear();
  }

  /** Latest position frame (for the field assembly and the warm-start cache). */
  get positions(): ReadonlyMap<string, NodePosition> {
    return this.latest;
  }

  /** Whether the settle loop is currently ticking (dev/test telemetry). */
  isRunning(): boolean {
    return this.running;
  }

  /** Current simulation alpha (dev/test telemetry). */
  alpha(): number {
    return this.sim.alpha();
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
