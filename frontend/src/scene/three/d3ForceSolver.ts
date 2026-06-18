// d3-force solver — the CPU force-simulation core driving the three.js field.
//
// Why d3-force and not a GPGPU/FA2 solver: d3-force (Bostock, v3) is the most
// battle-tested force-directed engine on the web. Its velocity-Verlet integrator
// with alpha-annealing converges deterministically, its quadtree/Barnes–Hut
// many-body is O(N log N), and — critically for THIS field — every stability and
// flicker control we need is first-class: deterministic phyllotaxis seeding (no
// RNG divergence between reloads), a manually-drivable tick (`stop()` + `tick()`),
// an `alpha < alphaMin` freeze point, and `fx`/`fy` node pinning for drag. The
// renderer owns the loop (render-on-demand); this solver never runs d3's internal
// timer — we `stop()` it at construction and step it ourselves, so the GPU idles
// to zero on settle.
//
// FRONTIER FORCE COMBINATION (the recipe leading knowledge-graph viz converge on):
//   • forceLink     — Hooke spring at `linkDistance`, strength DEGREE-NORMALIZED
//                     (1/min(deg) × a global multiplier) so hubs aren't yanked
//                     around by their many edges — the single most important
//                     stability lever for graphs with high-degree feature nodes.
//   • forceManyBody — Barnes–Hut repulsion, bounded by `distanceMax` so the layout
//                     stays compact and disconnected components don't drift to
//                     infinity (finite distanceMax also makes it faster).
//   • forceCollide  — circle non-overlap at the real node radius (+pad), the clean
//                     "no two nodes touching" look; a soft constraint (strength<1,
//                     1 iteration) so it relaxes instead of buzzing.
//   • forceX/forceY(0) — gentle positional gravity toward the origin. Chosen over
//                     forceCenter: forceX/Y is a per-node spring that both centres
//                     AND keeps the layout compact, and it never fights the other
//                     forces the way a hard centroid-translation can.
//
// FLICKER-FREE INIT: `prewarm()` runs the violent early ticks SYNCHRONOUSLY and
// off-screen (bounded by tick count AND wall-clock) so the first frame the user
// ever sees is already near-equilibrium — no "explode then settle", no camera
// re-fit jump. The renderer fits the camera once after prewarm and reveals.

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
  /** Freeze threshold: the sim is "settled" once alpha drops below this. */
  alphaMin: number;
  /** Warm alpha target held while a node is being dragged. */
  dragAlphaTarget: number;
}

export const D3_FORCE_DEFAULTS: D3ForceParams = {
  // Tuned for world-space node radii ≈ 4–20 (appearance.ts BASE_POINT_SIZE = 4),
  // a ~50–2000-node knowledge graph. Values follow the frontier d3-force recipe:
  // degree-normalized springs, bounded Barnes–Hut repulsion, soft collide, gentle
  // forceX/Y gravity (no forceCenter), heavier damping + decisive cooling so the
  // settle is fast AND calm (no low-energy crawl, no jitter at rest).
  linkDistance: 40,
  linkStrength: 1,
  charge: -120,
  chargeDistanceMax: 0, // auto = ~10× linkDistance (bounded → compact + fast)
  chargeTheta: 0.8,
  centerStrength: 0.06,
  collidePadding: 3,
  collideStrength: 0.8,
  collideIterations: 1, // 1 avoids the velocity ping-pong that 2+ can induce
  velocityDecay: 0.5, // primary damping — kills overshoot/oscillation
  alphaDecay: 0.05, // ~104 ticks to settle (vs 300) — decisive, hides nothing
  alphaMin: 0.005, // freeze cleanly instead of crawling at low energy
  dragAlphaTarget: 0.3,
};

/** Cold-start alpha for a fresh layout (d3's full-energy default). */
const COLD_ALPHA = 1;
/** Warm-start alpha for a re-energise that should not fully explode. */
const WARM_ALPHA = 0.5;
/** Pre-warm caps: settle off-screen but never block the main thread for long. */
const PREWARM_MAX_TICKS = 300;
const PREWARM_BUDGET_MS = 260;

/** Per-tick dynamics for the host's convergence / diagnostics. */
export interface TickMetrics {
  alpha: number;
  /** Mean per-node displacement this tick (→0 at rest). */
  meanDisplacement: number;
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
  private params: D3ForceParams;
  private dragIndex = -1;

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

    // Degree per node — drives the degree-normalized spring strength below.
    this.degree = new Array<number>(nodeCount).fill(0);
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

  /**
   * Run the violent early ticks SYNCHRONOUSLY and off-screen so the first visible
   * frame is already near-equilibrium — the core of flicker-free init. Bounded by
   * both a tick cap and a wall-clock budget so a large graph never janks the main
   * thread (it reveals slightly less settled and finishes gently in the live loop).
   */
  prewarm(maxTicks = PREWARM_MAX_TICKS, budgetMs = PREWARM_BUDGET_MS): number {
    this.sim.alpha(COLD_ALPHA).alphaTarget(0);
    const start = now();
    let ticks = 0;
    while (ticks < maxTicks) {
      this.sim.tick();
      ticks++;
      if (this.sim.alpha() < this.params.alphaMin) break;
      if (ticks % 16 === 0 && now() - start > budgetMs) break;
    }
    return ticks;
  }

  /** Advance one tick; returns alpha + mean per-node displacement. */
  tick(): TickMetrics {
    this.sim.tick();
    let disp = 0;
    for (let i = 0; i < this.count; i++) {
      const n = this.nodes[i];
      disp += Math.hypot(n.vx ?? 0, n.vy ?? 0);
    }
    return {
      alpha: this.sim.alpha(),
      meanDisplacement: this.count > 0 ? disp / this.count : 0,
    };
  }

  /** Re-energise (e.g. a resume/restart). Cold = full explode, warm = gentle. */
  reheat(cold = false): void {
    this.sim.alpha(cold ? COLD_ALPHA : WARM_ALPHA).alphaTarget(0);
  }

  /** True once cooled below the freeze threshold (and not held warm by a drag). */
  isSettled(): boolean {
    return this.sim.alphaTarget() === 0 && this.sim.alpha() < this.params.alphaMin;
  }

  alpha(): number {
    return this.sim.alpha();
  }

  /**
   * Cursor-pin a node: d3 resets its position to fx/fy and zeroes its velocity at
   * each tick's end, so it tracks the cursor exactly while its springs pull the
   * connected neighbours along (visible edge-pull). Holds the sim warm so distant
   * settled nodes stay put but the dragged neighbourhood keeps following.
   */
  setDrag(index: number, x: number, y: number): void {
    if (index < 0 || index >= this.count) return;
    const n = this.nodes[index];
    n.fx = x;
    n.fy = y;
    if (this.dragIndex !== index) {
      this.dragIndex = index;
      this.sim.alphaTarget(this.params.dragAlphaTarget);
    }
  }

  /** Release the dragged node and let the neighbourhood re-settle, then freeze. */
  clearDrag(): void {
    if (this.dragIndex < 0) return;
    const n = this.nodes[this.dragIndex];
    n.fx = null;
    n.fy = null;
    this.dragIndex = -1;
    this.sim.alphaTarget(0);
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

  dispose(): void {
    this.sim.stop();
    this.nodes.length = 0;
  }
}

/** Node index from a (possibly still-numeric) link endpoint. */
function idxOf(endpoint: D3Node | number | string): number {
  return typeof endpoint === "object" ? (endpoint.index ?? 0) : Number(endpoint);
}
