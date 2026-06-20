// d3-force solver — the CPU force-simulation core driving the three.js field.
//
// Why d3-force and not a GPGPU/FA2 solver: d3-force (Bostock, v3) is the most
// battle-tested force-directed engine on the web. Its damped symplectic-Euler
// integrator (which d3's docs loosely call "velocity Verlet") with alpha-annealing
// converges deterministically, its quadtree/Barnes–Hut
// many-body is O(N log N), and — critically for THIS field — every stability and
// flicker control we need is first-class: deterministic phyllotaxis seeding (no
// RNG divergence between reloads), a manually-drivable tick (`stop()` + `tick()`),
// and `fx`/`fy` node pinning. The renderer owns the loop (render-on-demand); this
// solver never runs d3's internal timer — we `stop()` it at construction and step
// it ourselves, so the GPU idles to zero on settle.
//
// FRONTIER FORCE COMBINATION (the recipe leading knowledge-graph viz converge on):
//   • forceLink     — Hooke spring at `linkDistance`, strength DEGREE-NORMALIZED
//                     (1/min(deg) × a global multiplier) so hubs aren't yanked
//                     around by their many edges — the single most important
//                     stability lever for graphs with high-degree feature nodes.
//   • forceManyBody — Barnes–Hut repulsion, bounded by `distanceMax` so repulsion
//                     stays LOCAL and the quadtree is cheaper (it is the forceX/Y
//                     gravity below — NOT distanceMax — that keeps disconnected
//                     components from drifting apart; finite distanceMax alone would
//                     let far components feel no repulsion and collapse together).
//   • forceCollide  — circle non-overlap at the real node radius (+pad), the clean
//                     "no two nodes touching" look; a soft constraint (strength<1,
//                     1 iteration). NB collide is NOT alpha-scaled, so it never fully
//                     cools — a dense graph "settles" only because the loop freezes
//                     it at alphaMin (see tick()); a true fixed point would require
//                     scaling collide by alpha (a known refinement).
//   • forceX/forceY(0) — gentle positional gravity toward the origin. Chosen over
//                     forceCenter: forceX/Y is a per-node spring that both centres
//                     AND keeps the layout compact, and it never fights the other
//                     forces the way a hard centroid-translation can.
//
// FLICKER-FREE INIT: `prewarm()` runs the violent early ticks SYNCHRONOUSLY and
// off-screen (bounded by tick count AND wall-clock) so the first frame the user
// ever sees is already near-equilibrium — no "explode then settle".
//
// SLEEPING NODES (drag locality — why grabbing one node must NOT wake the graph):
// d3's `alpha` is a GLOBAL temperature that scales EVERY force, and a "settled"
// layout is settled only because alpha is tiny — the underlying forces are still
// substantial (e.g. centering pulls a far node hard, balanced by repulsion only
// approximately). So the canonical d3 drag (`alphaTarget(0.3).restart()`) re-reveals
// those forces everywhere and the whole graph jiggles. Most graph tools — Obsidian's
// own graph included — live with that drift; freezing distant settled nodes is the
// rarer behaviour we want here, inspired by physics-engine sleeping.
//
// Our model is a sleep/active-set layer on d3. It is INSPIRED BY, but is NOT, a
// Box2D island system: Box2D sleeps/wakes whole connected ISLANDS atomically and
// wakes through every contact; we instead wake PER-NODE, only along links that
// actually stretched, and only within a spatial radius around the cursor — trading
// strict force-balance for locality. A sleeping node is PINNED via `fx`/`fy`, so d3
// holds it fixed regardless of the global alpha — physically immovable, not merely
// "low energy" (INVARIANT: asleep ⇔ pinned; see sleepAll/sleepNode/wakeNode). A drag
// pins the grabbed node to the cursor and wakes nodes by PROPAGATION: a node that
// has actually moved more than `wakeMove` from its rest drags its sleeping link-
// neighbours awake (a stretched spring is a real force) within `wakeRadius`. Motion
// ripples outward only as far as the drag truly reaches; distant clusters are pinned
// and cannot move — so a node dragged THROUGH an unrelated cluster overlaps it rather
// than parting it (a deliberate locality/physicality trade). d3 still computes the
// full force field — sleeping nodes remain in the quadtree as fixed obstacles — but
// only awake nodes are free to integrate.

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type ForceLink,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import { controlNumber, simulationDefaults } from "./graphControlSchema";

/** A simulation node: d3's earmarked fields plus the collision radius. */
export interface D3Node extends SimulationNodeDatum {
  /** Collision radius in world units (the node's drawn body radius). */
  radius: number;
}

/** A simulation link between two node array indices. */
export type D3Link = SimulationLinkDatum<D3Node>;

/** Edge as resolved node *indices* into the nodes array (renderer-built). */
export interface SolverEdge {
  source: number;
  target: number;
}

export interface D3ForceParams {
  /** Spring rest length, centre-to-centre, in world units. */
  linkDistance: number;
  /** Global multiplier on the degree-normalized spring strength (Obsidian's
   *  "link force"). 1 = the d3 default 1/min(deg(src),deg(dst)). */
  linkStrength: number;
  /** Many-body charge. Negative = repulsion (electrostatic). */
  charge: number;
  /** Max distance the charge is considered over; 0 = auto (scaled to graph size).
   *  A finite bound keeps the layout compact + stable and speeds the quadtree. */
  chargeDistanceMax: number;
  /** Barnes–Hut accuracy criterion (lower = more accurate + slower). */
  chargeTheta: number;
  /** forceX/forceY(0) strength — gravity toward the origin (compactness + centre). */
  centerStrength: number;
  /** Extra gap added to each node's collision radius, world units. */
  collidePadding: number;
  /** Collision softness in [0,1] (<1 relaxes instead of buzzing). */
  collideStrength: number;
  /** Collision relaxation iterations per tick. */
  collideIterations: number;
  /** Atmospheric friction: velocity *= (1 - velocityDecay) each tick. */
  velocityDecay: number;
  /** Per-tick cooling rate; default 0.0228 ≈ 300 ticks to settle. */
  alphaDecay: number;
  /** Freeze threshold: the global settle is "done" once alpha drops below this. */
  alphaMin: number;
  /** Alpha held while dragging — energy for the WOKEN region only (sleeping nodes
   *  are pinned, so this does not move them). */
  dragAlpha: number;
  /** How far a node must move from its rest (world units) before it drags its
   *  sleeping link-neighbours awake — the "force above threshold" propagation. */
  wakeMove: number;
  /** Spatial bound (world units) on the drag's influence: only sleeping nodes
   *  within this radius of the dragged node may wake, so distant settled clusters
   *  stay frozen however they are connected. 0 = auto (~7× linkDistance). */
  wakeRadius: number;
  /** Speed below which an AWAKE node is counted quiet (heading toward sleep). */
  sleepSpeed: number;
  /** Consecutive quiet ticks before an awake node goes back to sleep. */
  sleepTicks: number;
}

// The defaults DERIVE from the canonical control registry (graphControlSchema) so
// the schema is the single source of truth — change a default there and the solver,
// the appearance path, and the lab control panels all follow. The frontier d3-force
// recipe (degree-normalized springs, bounded Barnes–Hut repulsion, soft collide,
// gentle forceX/Y gravity, heavier damping + decisive cooling so the settle is fast
// AND calm) lives in those schema defaults plus the force construction below; values
// are tuned for world-space node radii ≈ 4–20 (BASE_POINT_SIZE = 4), ~50–2000 nodes.
export const D3_FORCE_DEFAULTS: D3ForceParams = simulationDefaults();

// Settle/init energy constants read FROM the canonical control registry
// (graphControlSchema) so each has ONE definition — value-preserving (coldAlpha 1,
// warmReheatAlpha 0.5, prewarm 300/260ms). The threeField warm-START alpha (0.3) is a
// DISTINCT path and is already schema-read there.
/** Cold-start alpha for a fresh layout (d3's full-energy default). */
const COLD_ALPHA = controlNumber("coldAlpha");
/** Warm/reheat alpha for a re-energise that should not fully explode. */
const WARM_ALPHA = controlNumber("warmReheatAlpha");
/** Pre-warm caps: settle off-screen but never block the main thread for long. */
const PREWARM_MAX_TICKS = controlNumber("prewarmMaxTicks");
const PREWARM_BUDGET_MS = controlNumber("prewarmBudgetMs");

/** Per-tick dynamics for the host's convergence / diagnostics. */
export interface TickMetrics {
  alpha: number;
  /** Mean displacement this tick over the AWAKE nodes (→0 at rest). */
  meanDisplacement: number;
  /** Number of awake (moving) nodes — 0 ⇒ the whole field is asleep. */
  awake: number;
}

const now = (): number => (typeof performance === "undefined" ? 0 : performance.now());

export class D3ForceSolver {
  readonly count: number;
  /** Square texture edge that holds `count` nodes — the renderer packs positions
   *  into a `texSize²` RGBA float texture and indexes it by node id in-shader. */
  readonly texSize: number;

  private readonly sim: Simulation<D3Node, D3Link>;
  private readonly nodes: D3Node[];
  private readonly link: ForceLink<D3Node, D3Link>;
  private readonly degree: number[];
  private readonly adjacency: number[][];
  private params: D3ForceParams;

  // --- sleeping / active-set state -----------------------------------------
  // `awake[i]` = node is free to move; a sleeping node is PINNED (fx/fy) at its
  // rest position so the global alpha cannot move it. `restX/Y` doubles as the pin
  // target and as the reference point for propagation (how far a node has moved).
  private readonly awake: Uint8Array;
  private readonly restX: Float32Array;
  private readonly restY: Float32Array;
  private readonly quiet: Uint16Array; // consecutive quiet ticks per awake node
  private awakeCount = 0;
  private dragIndex = -1;
  // Local mode gates sleeping (a drag perturbation); the global layout settle runs
  // pure d3 with everything awake and unpinned until it cools.
  private localMode = false;

  constructor(
    nodeCount: number,
    edges: SolverEdge[],
    radii: number[],
    params: D3ForceParams,
  ) {
    this.count = nodeCount;
    this.texSize = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, nodeCount))));
    this.params = params;

    // Nodes carry only index (assigned by d3) + radius. x/y left undefined so d3
    // seeds them deterministically (phyllotaxis), the key to reload-stable layouts.
    this.nodes = new Array<D3Node>(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
      this.nodes[i] = { index: i, radius: radii[i] ?? 4 };
    }

    this.awake = new Uint8Array(nodeCount);
    this.restX = new Float32Array(nodeCount);
    this.restY = new Float32Array(nodeCount);
    this.quiet = new Uint16Array(nodeCount);

    // Degree + adjacency — degree drives the normalized spring strength; adjacency
    // drives the drag wake-propagation along links.
    this.degree = new Array<number>(nodeCount).fill(0);
    this.adjacency = Array.from({ length: nodeCount }, () => [] as number[]);
    const links: D3Link[] = [];
    for (const e of edges) {
      if (
        e.source < 0 ||
        e.target < 0 ||
        e.source >= nodeCount ||
        e.target >= nodeCount
      ) {
        continue;
      }
      if (e.source === e.target) continue;
      this.degree[e.source]++;
      this.degree[e.target]++;
      this.adjacency[e.source].push(e.target);
      this.adjacency[e.target].push(e.source);
      links.push({ source: e.source, target: e.target });
    }

    this.link = forceLink<D3Node, D3Link>(links)
      .id((n) => n.index ?? 0)
      .distance(params.linkDistance)
      .strength((l) => this.springStrength(l));

    // `forceSimulation` starts d3's internal timer immediately — stop it at once
    // so OUR render loop is the sole driver (render-on-demand, idle GPU on settle).
    this.sim = forceSimulation<D3Node, D3Link>(this.nodes)
      .velocityDecay(params.velocityDecay)
      .alphaDecay(params.alphaDecay)
      .alphaMin(params.alphaMin)
      .force("link", this.link)
      .force("charge", this.manyBody())
      .force("collide", this.collide())
      .force("x", forceX<D3Node>(0).strength(params.centerStrength))
      .force("y", forceY<D3Node>(0).strength(params.centerStrength))
      .stop();
  }

  /** Degree-normalized spring strength × the global multiplier (hub-stabilizing). */
  private springStrength(l: D3Link): number {
    const a = this.degree[idxOf(l.source)] || 1;
    const b = this.degree[idxOf(l.target)] || 1;
    return this.params.linkStrength / Math.min(a, b);
  }

  private manyBody() {
    const p = this.params;
    const max = p.chargeDistanceMax > 0 ? p.chargeDistanceMax : this.autoDistanceMax();
    return (
      forceManyBody<D3Node>()
        .strength(p.charge)
        .theta(p.chargeTheta)
        // Soften the close-range spike (collide already prevents overlap) so a near
        // pair can't fling apart and start an oscillation.
        .distanceMin(p.linkDistance * 0.25)
        .distanceMax(max)
    );
  }

  private collide() {
    const p = this.params;
    return forceCollide<D3Node>()
      .radius((n) => n.radius + p.collidePadding)
      .strength(p.collideStrength)
      .iterations(p.collideIterations);
  }

  /** Bound repulsion to ~10× the link distance (the frontier guidance): big enough
   *  that clusters spread and read as clusters, small enough that distant
   *  components don't globally repel each other into a ring — and finite repulsion
   *  is faster and more localized than the d3 default of Infinity. */
  private autoDistanceMax(): number {
    return Math.max(350, Math.min(1400, this.params.linkDistance * 10));
  }

  // --- sleeping helpers -----------------------------------------------------

  /** Free every node (clear pins) and mark all awake — the global-settle state.
   *  Also clears any in-flight drag: a global re-energise (reheat/prewarm/setParams)
   *  must not leave a stale dragIndex pointing at a now-woken node (review follow-up
   *  — makes the asleep⟺pinned invariant provably hold even if a knob is retuned
   *  mid-drag). */
  private wakeAllFree(): void {
    for (let i = 0; i < this.count; i++) {
      const n = this.nodes[i];
      n.fx = null;
      n.fy = null;
    }
    this.awake.fill(1);
    this.quiet.fill(0);
    this.awakeCount = this.count;
    this.dragIndex = -1;
  }

  /** Record every node's current position as its rest, PIN it there (fx/fy), and
   *  mark it asleep. Pinning is the load-bearing invariant (asleep ⇔ pinned): an
   *  asleep node is ALWAYS pinned, so the global alpha can never drift it.
   *
   *  (Bug H1, fixed here: the global settle used to sleep WITHOUT pinning. A later
   *  drag only re-pins sleepers on the first localMode entry, so any node slept by
   *  this guard after a previous drag stayed unpinned, and the next grab integrated
   *  it at dragAlpha — distant "settled" nodes slid a little on every drag. Pinning
   *  here makes asleep ⇔ pinned hold on every path.) */
  private sleepAll(): void {
    for (let i = 0; i < this.count; i++) {
      const n = this.nodes[i];
      this.restX[i] = n.x ?? 0;
      this.restY[i] = n.y ?? 0;
      n.fx = this.restX[i];
      n.fy = this.restY[i];
      n.vx = 0;
      n.vy = 0;
      this.awake[i] = 0;
      this.quiet[i] = 0;
    }
    this.awakeCount = 0;
  }

  /** Pin every sleeping node at its rest position so the global alpha can't move
   *  it — done when a drag enters local mode. */
  private pinSleeping(): void {
    for (let i = 0; i < this.count; i++) {
      if (this.awake[i] || i === this.dragIndex) continue;
      const n = this.nodes[i];
      n.fx = this.restX[i];
      n.fy = this.restY[i];
      n.vx = 0;
      n.vy = 0;
    }
  }

  /** Put one awake node to sleep where it sits: record rest, pin, zero velocity. */
  private sleepNode(i: number): void {
    if (!this.awake[i]) return;
    const n = this.nodes[i];
    this.restX[i] = n.x ?? 0;
    this.restY[i] = n.y ?? 0;
    n.fx = this.restX[i];
    n.fy = this.restY[i];
    n.vx = 0;
    n.vy = 0;
    this.awake[i] = 0;
    this.quiet[i] = 0;
    this.awakeCount--;
  }

  /** Wake one sleeping node: unpin it so forces can move it. Its rest stays put as
   *  the reference for further propagation. */
  private wakeNode(i: number): void {
    if (this.awake[i]) return;
    const n = this.nodes[i];
    n.fx = null;
    n.fy = null;
    this.awake[i] = 1;
    this.quiet[i] = 0;
    this.awakeCount++;
  }

  /**
   * Warm-start seed: place nodes at given positions (zeroing velocity) BEFORE the
   * first prewarm, so a re-`setData` that carries most nodes over by id resumes from
   * the prior layout instead of re-exploding (object constancy). `seedFn(i)` returns
   * the world {x, y} for node i, or null to leave d3's deterministic phyllotaxis seed
   * in place (for a node with no prior position). Velocity is zeroed so the seeded
   * layout starts at rest.
   */
  seed(seedFn: (index: number) => { x: number; y: number } | null): void {
    for (let i = 0; i < this.count; i++) {
      const s = seedFn(i);
      if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
      const n = this.nodes[i];
      n.x = s.x;
      n.y = s.y;
      n.vx = 0;
      n.vy = 0;
    }
  }

  /**
   * Run the violent early ticks SYNCHRONOUSLY and off-screen so the first visible
   * frame is already near-equilibrium — the core of flicker-free init. The global
   * settle runs pure d3 (everything awake + unpinned) and sleeps the whole graph
   * when it cools. Bounded by a tick cap AND a wall-clock budget so a large graph
   * never janks the main thread (it reveals slightly less settled and finishes
   * gently in the live loop). `startAlpha` defaults to a full cold start; a warm
   * start (most nodes seeded from the prior layout) passes a lower value so the
   * carried layout barely moves while new nodes settle in.
   */
  prewarm(
    maxTicks = PREWARM_MAX_TICKS,
    budgetMs = PREWARM_BUDGET_MS,
    startAlpha = COLD_ALPHA,
  ): number {
    this.localMode = false;
    this.wakeAllFree();
    this.sim.alpha(startAlpha).alphaTarget(0);
    const start = now();
    let ticks = 0;
    while (ticks < maxTicks) {
      this.tick();
      ticks++;
      if (this.awakeCount === 0) break; // fully settled → whole graph asleep
      if (ticks % 16 === 0 && now() - start > budgetMs) break;
    }
    return ticks;
  }

  /** Advance one tick. Pure d3 during the global settle; gated (sleeping) once a
   *  drag has put the field into local mode. */
  tick(): TickMetrics {
    const dragging = this.dragIndex >= 0;

    // Global cool-down guarantee: once cooled and not interacting, the whole graph
    // sleeps — a definite stop even if a soft collide would otherwise micro-buzz.
    if (!dragging && this.sim.alpha() < this.params.alphaMin && this.awakeCount > 0) {
      this.sleepAll();
      return { alpha: this.sim.alpha(), meanDisplacement: 0, awake: 0 };
    }

    this.sim.tick(); // d3 integrates free nodes; pinned (sleeping/dragged) stay fixed.

    if (!this.localMode) {
      // Global layout settle — no gating; nodes sleep only via the guarantee above.
      let disp = 0;
      for (let i = 0; i < this.count; i++) {
        const n = this.nodes[i];
        disp += Math.hypot(n.vx ?? 0, n.vy ?? 0);
      }
      return {
        alpha: this.sim.alpha(),
        meanDisplacement: this.count ? disp / this.count : 0,
        awake: this.awakeCount,
      };
    }

    // --- local mode: sleep quiet awake nodes, then propagate wake along links ---
    const { sleepSpeed, sleepTicks } = this.params;
    let disp = 0;
    let movers = 0;
    for (let i = 0; i < this.count; i++) {
      if (i === this.dragIndex || !this.awake[i]) continue;
      const n = this.nodes[i];
      const speed = Math.hypot(n.vx ?? 0, n.vy ?? 0);
      disp += speed;
      movers++;
      if (speed < sleepSpeed) {
        if (++this.quiet[i] >= sleepTicks) this.sleepNode(i);
      } else {
        this.quiet[i] = 0;
      }
    }

    // Wake propagation runs only while dragging and is bounded to a spatial radius
    // around the cursor, so the disturbance stays LOCAL: a node that has actually
    // moved past wakeMove drags its sleeping link-neighbours awake, but only those
    // within `wakeRadius` of the dragged node. A distant settled cluster is never
    // woken, however the drag connects to it — it stays pinned. (Post-release the
    // woken region just relaxes and sleeps; no new wakes are needed.)
    if (dragging) {
      const dn = this.nodes[this.dragIndex];
      const cx = dn.x ?? 0;
      const cy = dn.y ?? 0;
      const r =
        this.params.wakeRadius > 0
          ? this.params.wakeRadius
          : this.params.linkDistance * 7;
      const r2 = r * r;
      const wakeMove = this.params.wakeMove;
      this.propagateWake(this.dragIndex, cx, cy, r2, wakeMove);
      for (let i = 0; i < this.count; i++) {
        if (this.awake[i] && i !== this.dragIndex) {
          this.propagateWake(i, cx, cy, r2, wakeMove);
        }
      }
    }

    return {
      alpha: this.sim.alpha(),
      meanDisplacement: movers ? disp / movers : 0,
      awake: this.awakeCount,
    };
  }

  private propagateWake(
    a: number,
    cx: number,
    cy: number,
    r2: number,
    wakeMove: number,
  ): void {
    const n = this.nodes[a];
    const ax = n.x ?? 0;
    const ay = n.y ?? 0;
    if (Math.hypot(ax - this.restX[a], ay - this.restY[a]) <= wakeMove) return;
    const stretchMin = wakeMove * 0.6;
    for (const s of this.adjacency[a]) {
      if (s === this.dragIndex || this.awake[s]) continue;
      // A sleeping neighbour is pinned at its rest, so its position IS its rest.
      const sx = this.restX[s];
      const sy = this.restY[s];
      const dx = sx - cx;
      const dy = sy - cy;
      if (dx * dx + dy * dy >= r2) continue; // outside the local radius → stays frozen
      // Wake only if the link a–s actually changed length — i.e. a real spring force
      // now acts on s — not merely because a moved in some unrelated direction.
      const restLen = Math.hypot(this.restX[a] - sx, this.restY[a] - sy);
      const curLen = Math.hypot(ax - sx, ay - sy);
      if (Math.abs(curLen - restLen) > stretchMin) this.wakeNode(s);
    }
  }

  /** Re-energise the whole layout (resume / explicit restart). Cold = full
   *  re-explode, warm = gentle. Returns to global (non-gated, unpinned) settle. */
  reheat(cold = false): void {
    this.localMode = false;
    this.wakeAllFree();
    this.sim.alpha(cold ? COLD_ALPHA : WARM_ALPHA).alphaTarget(0);
  }

  /** True once the field is at rest: nothing awake and nothing being dragged. */
  isSettled(): boolean {
    return this.dragIndex < 0 && this.awakeCount === 0;
  }

  alpha(): number {
    return this.sim.alpha();
  }

  /** Number of currently-moving nodes (0 ⇒ asleep). */
  get activeCount(): number {
    return this.awakeCount + (this.dragIndex >= 0 ? 1 : 0);
  }

  /**
   * Cursor-pin a node and wake ONLY what the drag actually disturbs — never the
   * whole graph. On the FIRST grab we enter local mode and pin every settled node
   * (fx/fy) so the global alpha is physically unable to move them. The grabbed node
   * is pinned to the cursor; as it moves past `wakeMove`, propagation wakes its
   * link-neighbours, and so on outward — but only as far as motion really reaches.
   * This is what stops the grab-reheats-everything jiggle d3's global alpha causes:
   * a settled node stays put because it is pinned, not merely low-energy.
   */
  setDrag(index: number, x: number, y: number): void {
    if (index < 0 || index >= this.count) return;
    const n = this.nodes[index];
    if (this.dragIndex !== index) {
      if (!this.localMode) {
        this.localMode = true;
        this.pinSleeping();
      }
      // The grabbed node leaves the awake set (it's driven by the cursor, not
      // forces); record its grab position as the propagation reference.
      if (this.awake[index]) {
        this.awake[index] = 0;
        this.awakeCount--;
      }
      this.restX[index] = n.x ?? x;
      this.restY[index] = n.y ?? y;
      this.dragIndex = index;
      // Energy for the region the drag wakes; pinned nodes ignore it entirely.
      this.sim.alpha(Math.max(this.sim.alpha(), this.params.dragAlpha));
      this.sim.alphaTarget(this.params.dragAlpha);
    }
    n.fx = x;
    n.fy = y;
  }

  /** Release the dragged node and let its woken neighbourhood re-settle + sleep. */
  clearDrag(): void {
    if (this.dragIndex < 0) return;
    const i = this.dragIndex;
    const n = this.nodes[i];
    n.fx = null;
    n.fy = null;
    this.restX[i] = n.x ?? 0; // measure further propagation from the release point
    this.restY[i] = n.y ?? 0;
    this.awake[i] = 1; // it becomes a free awake node and settles into place
    this.awakeCount++;
    this.quiet[i] = 0;
    this.dragIndex = -1;
    this.sim.alphaTarget(0); // cool the woken region; the rest stays pinned + asleep
  }

  /** Pack node positions into a `texSize²` RGBA float buffer as (x, y, 0, 1). A
   *  non-finite coordinate is written as the origin (defensive; d3 jiggles
   *  coincident nodes deterministically, so NaN should not arise). */
  pack(out: Float32Array): void {
    for (let i = 0; i < this.count; i++) {
      const n = this.nodes[i];
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const finite = Number.isFinite(x) && Number.isFinite(y);
      out[i * 4] = finite ? x : 0;
      out[i * 4 + 1] = finite ? y : 0;
      out[i * 4 + 2] = 0;
      out[i * 4 + 3] = 1;
    }
  }

  /** Position of one node (for picking / fit / focus). */
  position(index: number): { x: number; y: number } | null {
    if (index < 0 || index >= this.count) return null;
    const n = this.nodes[index];
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return null;
    return { x: n.x as number, y: n.y as number };
  }

  /** Re-tune the forces live (graph-lab knob set) and gently reheat. */
  setParams(params: D3ForceParams): void {
    this.params = params;
    this.sim
      .velocityDecay(params.velocityDecay)
      .alphaDecay(params.alphaDecay)
      .alphaMin(params.alphaMin);
    this.link.distance(params.linkDistance).strength((l) => this.springStrength(l));
    this.sim.force("charge", this.manyBody());
    this.sim.force("collide", this.collide());
    this.sim.force("x", forceX<D3Node>(0).strength(params.centerStrength));
    this.sim.force("y", forceY<D3Node>(0).strength(params.centerStrength));
    this.reheat(false);
  }

  getParams(): D3ForceParams {
    return { ...this.params };
  }

  /** Update collision radii live (a node-size appearance change) so the non-overlap
   *  spacing tracks the drawn node size, then rebuild the collide force and gently
   *  reheat. Node size is both look AND behaviour — the drawn disc and the collision
   *  body are the same radius — so a size knob that did not re-feed collide would let
   *  enlarged nodes overlap. Non-finite entries are ignored (keep the prior radius). */
  setRadii(radii: number[]): void {
    for (let i = 0; i < this.count; i++) {
      const r = radii[i];
      if (typeof r === "number" && Number.isFinite(r)) this.nodes[i].radius = r;
    }
    this.sim.force("collide", this.collide());
    this.reheat(false);
  }

  dispose(): void {
    this.sim.stop();
    this.nodes.length = 0;
  }
}

/** Node index from a (possibly still-numeric) link endpoint. */
function idxOf(endpoint: D3Node | number | string): number {
  return typeof endpoint === "object" ? (endpoint.index ?? 0) : Number(endpoint);
}
