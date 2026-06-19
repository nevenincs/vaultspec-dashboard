// CPU force-solver tests — the sleep/active-set + drag-locality model is the
// product's headline behaviour and previously had ZERO coverage. This suite
// pins the asleep ⇔ pinned invariant (the H1 bug just fixed), grab/drag/settle
// dynamics, determinism (d3's seeded LCG), and NaN-safety on pathological graphs.
//
// The solver is pure-CPU JS (d3-force); no WebGL/three.js is required — we
// construct it directly and drive tick(). Internal state (awake/restX/nodes/...)
// is TS-private; tests read it via `(solver as any).<field>`, standard practice
// for white-box invariant checks (we never mutate the solver to expose it).

import { describe, expect, it } from "vitest";

import {
  D3_FORCE_DEFAULTS,
  D3ForceSolver,
  type D3ForceParams,
  type SolverEdge,
} from "./d3ForceSolver";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- helpers ---------------------------------------------------------------

const params = (over: Partial<D3ForceParams> = {}): D3ForceParams => ({
  ...D3_FORCE_DEFAULTS,
  ...over,
});

/** A small ring graph: node i links to node i+1 (mod n). Connected, low degree. */
function ringEdges(n: number): SolverEdge[] {
  const edges: SolverEdge[] = [];
  for (let i = 0; i < n; i++) {
    edges.push({ source: i, target: (i + 1) % n });
  }
  return edges;
}

/** A path graph: 0-1-2-...-(n-1). Used for clean locality reasoning (each
 *  interior node has exactly two neighbours; the ends have one). */
function pathEdges(n: number): SolverEdge[] {
  const edges: SolverEdge[] = [];
  for (let i = 0; i < n - 1; i++) {
    edges.push({ source: i, target: i + 1 });
  }
  return edges;
}

function makeSolver(
  n: number,
  edges: SolverEdge[],
  over: Partial<D3ForceParams> = {},
): D3ForceSolver {
  const radii = Array.from({ length: n }, () => 4);
  return new D3ForceSolver(n, edges, radii, params(over));
}

/** Snapshot every node's (x,y) for displacement comparisons. */
function positions(solver: D3ForceSolver): { x: number; y: number }[] {
  const nodes = (solver as any).nodes as { x?: number; y?: number }[];
  return nodes.map((n) => ({ x: n.x ?? 0, y: n.y ?? 0 }));
}

function displacement(
  a: { x: number; y: number }[],
  b: { x: number; y: number }[],
  i: number,
): number {
  return Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
}

/** Tick to a hard rest (or the cap). Returns whether it settled. */
function settle(solver: D3ForceSolver, maxTicks = 2000): boolean {
  for (let t = 0; t < maxTicks; t++) {
    if (solver.isSettled()) return true;
    solver.tick();
  }
  return solver.isSettled();
}

// ---- 1. H1 invariant: asleep ⇔ pinned --------------------------------------

describe("D3ForceSolver — H1 invariant (asleep ⇔ pinned)", () => {
  it("every asleep node is pinned (fx & fy non-null) after prewarm", () => {
    const solver = makeSolver(40, ringEdges(40));
    solver.prewarm();

    const nodes = (solver as any).nodes as { fx: number | null; fy: number | null }[];
    const awake = (solver as any).awake as Uint8Array;

    // Prewarm settles the whole graph to sleep.
    expect(solver.isSettled()).toBe(true);
    expect((solver as any).awakeCount).toBe(0);
    expect((solver as any).localMode).toBe(false);

    let asleepCount = 0;
    for (let i = 0; i < 40; i++) {
      if (awake[i] === 0) {
        asleepCount++;
        expect(nodes[i].fx).not.toBeNull();
        expect(nodes[i].fy).not.toBeNull();
        expect(Number.isFinite(nodes[i].fx as number)).toBe(true);
        expect(Number.isFinite(nodes[i].fy as number)).toBe(true);
      }
    }
    expect(asleepCount).toBe(40);
  });

  it("holds after a full drag cycle — sleeping nodes slept after a drag stay pinned", () => {
    // This is the exact H1 regression: the global-settle guard used to sleep
    // WITHOUT pinning, so a node slept after a drag stayed unpinned and the next
    // grab integrated it at dragAlpha. Drive a full grab→move→release→settle and
    // assert the invariant survives.
    const solver = makeSolver(60, ringEdges(60));
    solver.prewarm();

    // Grab a node and yank it well past wakeMove over several steps.
    const grab = 10;
    const p = positions(solver)[grab];
    solver.setDrag(grab, p.x, p.y);
    for (let s = 1; s <= 8; s++) {
      solver.setDrag(grab, p.x + s * 12, p.y + s * 12);
      solver.tick();
    }
    solver.clearDrag();

    // Tick to a hard rest — the woken region relaxes and re-sleeps.
    expect(settle(solver)).toBe(true);

    const nodes = (solver as any).nodes as { fx: number | null; fy: number | null }[];
    const awake = (solver as any).awake as Uint8Array;
    expect((solver as any).awakeCount).toBe(0);
    for (let i = 0; i < 60; i++) {
      // After settle nothing is awake, so EVERY node must be pinned.
      expect(awake[i]).toBe(0);
      expect(nodes[i].fx).not.toBeNull();
      expect(nodes[i].fy).not.toBeNull();
    }
  });

  it("the inverse holds during a drag: an awake node is NOT pinned", () => {
    const solver = makeSolver(40, pathEdges(40));
    solver.prewarm();

    const grab = 20;
    const start = positions(solver)[grab];
    solver.setDrag(grab, start.x, start.y);
    // Move far enough to wake neighbours.
    for (let s = 1; s <= 10; s++) {
      solver.setDrag(grab, start.x + s * 20, start.y);
      solver.tick();
    }

    const nodes = (solver as any).nodes as { fx: number | null; fy: number | null }[];
    const awake = (solver as any).awake as Uint8Array;
    // At least the immediate neighbours should be awake by now.
    expect((solver as any).awakeCount).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) {
      if (i === (solver as any).dragIndex) {
        // The dragged node is pinned to the cursor (not in the awake set).
        expect(nodes[i].fx).not.toBeNull();
        continue;
      }
      if (awake[i] === 1) {
        // Awake ⇒ free (unpinned) so forces can integrate it.
        expect(nodes[i].fx).toBeNull();
        expect(nodes[i].fy).toBeNull();
      } else {
        // Asleep ⇒ pinned (the invariant's other half).
        expect(nodes[i].fx).not.toBeNull();
        expect(nodes[i].fy).not.toBeNull();
      }
    }
  });
});

// ---- 2. Grab = zero motion -------------------------------------------------

describe("D3ForceSolver — grab without movement", () => {
  it("grabbing a settled node and ticking moves nothing and wakes nothing", () => {
    const solver = makeSolver(50, ringEdges(50));
    solver.prewarm();
    const before = positions(solver);

    const grab = 7;
    const p = before[grab];
    // Grab at the node's exact rest position; never move the cursor.
    solver.setDrag(grab, p.x, p.y);
    for (let t = 0; t < 40; t++) solver.tick();

    const after = positions(solver);
    // No cursor movement past wakeMove ⇒ no propagation ⇒ nothing wakes. This is
    // the real "zero motion" guarantee: the active set never grows.
    expect((solver as any).awakeCount).toBe(0);
    // The only residual is float32 round-off from the non-alpha-scaled collide
    // force (~1e-5 world units; the solver's own comment notes collide never fully
    // cools). ε of 1e-3 is a thousandth of a world unit — far below node radii (4)
    // and link distance (40), i.e. imperceptible. Nothing actually moves.
    for (let i = 0; i < 50; i++) {
      expect(displacement(before, after, i)).toBeLessThan(1e-3);
    }
  });
});

// ---- 3. Drag locality ------------------------------------------------------

describe("D3ForceSolver — drag locality", () => {
  it("moves link-neighbours (edge-pull) while distant nodes stay frozen", () => {
    // Locality is measured around the CURSOR, not the grab's start point: the wake
    // radius tracks the dragged node's live position, and a sleeping candidate is
    // tested at its OWN rest. So link-neighbours wake only if they sit inside
    // `wakeRadius` of the cursor (the deliberate "drag THROUGH an unrelated cluster
    // overlaps it" trade documented in the solver). To assert both halves cleanly
    // we use a LARGE ring (so consecutive nodes are ~linkDistance apart — inside
    // the radius — while the far arc is well outside it) with an explicit small
    // `wakeRadius`, keep the drag modest, and call a node "far" only when it is
    // beyond the radius of BOTH the start and the final cursor position.
    const n = 200;
    const radius = 120;
    const solver = makeSolver(n, ringEdges(n), {
      wakeRadius: radius,
      wakeMove: 8,
    });
    solver.prewarm();
    const before = positions(solver);

    const grab = 50;
    const p = before[grab];
    // A short tangential drag (cursor travels ~90 units) — stretches the immediate
    // springs past wakeMove without walking the cursor across the ring.
    for (let s = 1; s <= 8; s++) {
      solver.setDrag(grab, p.x + s * 8, p.y + s * 8);
      solver.tick();
    }
    const after = positions(solver);
    const cursor = positions(solver)[grab]; // final cursor position

    // The ring's link-neighbours (49, 51) feel the stretched spring → they moved.
    const neighbourMove = Math.max(
      displacement(before, after, grab - 1),
      displacement(before, after, grab + 1),
    );
    expect(neighbourMove).toBeGreaterThan(1); // a real, visible pull
    expect((solver as any).awakeCount).toBeGreaterThan(0); // propagation woke ≥1

    // Every node beyond the local radius of the whole short drag path is pinned
    // (asleep) and must not move — only float noise from the non-cooling collide.
    let maxFarMove = 0;
    let farChecked = 0;
    for (let i = 0; i < n; i++) {
      if (i === grab) continue;
      const dStart = Math.hypot(before[i].x - p.x, before[i].y - p.y);
      const dFinal = Math.hypot(before[i].x - cursor.x, before[i].y - cursor.y);
      if (dStart > radius && dFinal > radius) {
        farChecked++;
        maxFarMove = Math.max(maxFarMove, displacement(before, after, i));
      }
    }
    expect(farChecked).toBeGreaterThan(0); // we actually exercised distant nodes
    expect(maxFarMove).toBeLessThan(1e-3); // frozen (float noise only)
    // The neighbour pull dominates the far (≈zero) motion by orders of magnitude.
    expect(neighbourMove).toBeGreaterThan(maxFarMove * 100);
  });
});

// ---- 4. Re-sleep / settle --------------------------------------------------

describe("D3ForceSolver — re-sleep after release", () => {
  it("reaches isSettled() with awake count 0 after a drag is released", () => {
    const solver = makeSolver(45, ringEdges(45));
    solver.prewarm();

    const grab = 3;
    const p = positions(solver)[grab];
    for (let s = 1; s <= 12; s++) {
      solver.setDrag(grab, p.x + s * 14, p.y - s * 9);
      solver.tick();
    }
    // Mid-drag the field is NOT settled (something is being dragged).
    expect(solver.isSettled()).toBe(false);

    solver.clearDrag();
    expect(settle(solver)).toBe(true);
    expect((solver as any).awakeCount).toBe(0);
    expect((solver as any).dragIndex).toBe(-1);
  });
});

// ---- 5. Determinism --------------------------------------------------------

describe("D3ForceSolver — determinism (seeded LCG)", () => {
  it("two solvers from the same graph+params prewarm to identical positions", () => {
    const edges = ringEdges(50);
    const a = makeSolver(50, edges);
    const b = makeSolver(50, edges);

    // Even before any tick, d3's deterministic phyllotaxis seeding agrees.
    expect(positions(a)).toEqual(positions(b));

    a.prewarm();
    b.prewarm();

    const pa = positions(a);
    const pb = positions(b);
    for (let i = 0; i < 50; i++) {
      expect(pa[i].x).toBe(pb[i].x);
      expect(pa[i].y).toBe(pb[i].y);
    }
  });

  it("an identical drag sequence on identical solvers yields identical results", () => {
    const edges = pathEdges(40);
    const a = makeSolver(40, edges);
    const b = makeSolver(40, edges);
    a.prewarm();
    b.prewarm();

    for (const solver of [a, b]) {
      const p = positions(solver)[20];
      for (let s = 1; s <= 10; s++) {
        solver.setDrag(20, p.x + s * 15, p.y);
        solver.tick();
      }
      solver.clearDrag();
      settle(solver);
    }
    expect(positions(a)).toEqual(positions(b));
  });
});

// ---- 6. NaN-safety on pathological graphs ----------------------------------

describe("D3ForceSolver — NaN-safety on pathological graphs", () => {
  function expectPackFinite(solver: D3ForceSolver, n: number): void {
    const out = new Float32Array(n * 4);
    solver.pack(out);
    for (let i = 0; i < out.length; i++) {
      expect(Number.isFinite(out[i])).toBe(true);
    }
  }

  it("self-loops are dropped and pack() stays finite", () => {
    const n = 20;
    const edges: SolverEdge[] = [];
    for (let i = 0; i < n; i++) edges.push({ source: i, target: i }); // all self-loops
    edges.push({ source: 0, target: 1 });
    const solver = makeSolver(n, edges);
    // Self-loops must not create degree/adjacency (they are skipped at build).
    expect((solver as any).degree[0]).toBe(1); // only the 0-1 edge counts
    solver.prewarm();
    expectPackFinite(solver, n);
  });

  it("duplicate edges + a huge hub stay finite through prewarm + drag", () => {
    const n = 80;
    const edges: SolverEdge[] = [];
    // A hub: node 0 connects to everyone, many times over (duplicates).
    for (let i = 1; i < n; i++) {
      edges.push({ source: 0, target: i });
      edges.push({ source: 0, target: i }); // duplicate
      edges.push({ source: 0, target: i }); // triplicate
    }
    const solver = makeSolver(n, edges);
    solver.prewarm();
    expectPackFinite(solver, n);

    // Drag the hub hard, then release and settle — still finite.
    const p = positions(solver)[0];
    for (let s = 1; s <= 15; s++) {
      solver.setDrag(0, p.x + s * 25, p.y + s * 25);
      solver.tick();
    }
    solver.clearDrag();
    settle(solver);
    expectPackFinite(solver, n);
  });

  it("coincident seed positions (forced overlap) recover to finite positions", () => {
    const n = 12;
    const solver = makeSolver(n, ringEdges(n));
    // Force a pathological start: every node at the exact same point, zero vel.
    const nodes = (solver as any).nodes as {
      x: number;
      y: number;
      vx: number;
      vy: number;
    }[];
    for (const node of nodes) {
      node.x = 0;
      node.y = 0;
      node.vx = 0;
      node.vy = 0;
    }
    solver.prewarm();
    expectPackFinite(solver, n);
    // The collide/charge forces must have separated them — not all at origin.
    const after = positions(solver);
    const spread = after.some((q) => Math.abs(q.x) > 1 || Math.abs(q.y) > 1);
    expect(spread).toBe(true);
  });

  it("a fully disconnected graph (no edges) still packs finite", () => {
    const n = 30;
    const solver = makeSolver(n, []);
    solver.prewarm();
    expectPackFinite(solver, n);
  });

  it("pack() writes the (x, y, 0, 1) layout", () => {
    const solver = makeSolver(5, ringEdges(5));
    solver.prewarm();
    const out = new Float32Array(5 * 4);
    solver.pack(out);
    for (let i = 0; i < 5; i++) {
      expect(out[i * 4 + 2]).toBe(0);
      expect(out[i * 4 + 3]).toBe(1);
    }
  });
});

// ---- 7. isSettled / activeCount across lifecycle states --------------------

describe("D3ForceSolver — isSettled & activeCount lifecycle", () => {
  it("a fresh (un-prewarmed) solver is settled with zero active nodes", () => {
    // Construction stops the sim; nothing is awake until prewarm/reheat.
    const solver = makeSolver(20, ringEdges(20));
    expect((solver as any).awakeCount).toBe(0);
    expect(solver.isSettled()).toBe(true);
    expect(solver.activeCount).toBe(0);
  });

  it("reheat wakes the whole graph; activeCount equals the node count", () => {
    const solver = makeSolver(25, ringEdges(25));
    solver.reheat(false);
    expect((solver as any).awakeCount).toBe(25);
    expect(solver.activeCount).toBe(25);
    expect(solver.isSettled()).toBe(false);
    expect(solver.alpha()).toBeCloseTo(0.5, 5); // WARM_ALPHA
  });

  it("activeCount counts the dragged node even when nothing is awake", () => {
    const solver = makeSolver(30, ringEdges(30));
    solver.prewarm();
    expect(solver.activeCount).toBe(0);

    const grab = 5;
    const p = positions(solver)[grab];
    solver.setDrag(grab, p.x, p.y); // grab, no move ⇒ awakeCount stays 0
    // The grabbed node left the awake set but is being dragged → active = 0 + 1.
    expect((solver as any).awakeCount).toBe(0);
    expect(solver.activeCount).toBe(1);
    expect(solver.isSettled()).toBe(false); // dragging ⇒ not settled

    solver.clearDrag();
    settle(solver);
    expect(solver.activeCount).toBe(0);
    expect(solver.isSettled()).toBe(true);
  });

  it("alpha cools monotonically toward alphaMin during the global settle", () => {
    const solver = makeSolver(40, ringEdges(40), { alphaDecay: 0.05 });
    solver.reheat(true); // COLD_ALPHA = 1
    const a0 = solver.alpha();
    solver.tick();
    solver.tick();
    const a1 = solver.alpha();
    expect(a1).toBeLessThan(a0);
    expect(solver.prewarm()).toBeGreaterThan(0); // returns the tick count it ran
    expect(solver.isSettled()).toBe(true);
  });
});

// ---- bonus: getParams / setParams round-trip -------------------------------

describe("D3ForceSolver — params plumbing", () => {
  it("getParams returns a copy; setParams reheats the layout", () => {
    const solver = makeSolver(20, ringEdges(20));
    solver.prewarm();
    expect(solver.isSettled()).toBe(true);

    const got = solver.getParams();
    expect(got).toEqual(D3_FORCE_DEFAULTS);
    got.linkDistance = 999; // mutate the copy
    expect(solver.getParams().linkDistance).toBe(D3_FORCE_DEFAULTS.linkDistance);

    solver.setParams(params({ linkDistance: 60 }));
    expect(solver.getParams().linkDistance).toBe(60);
    // setParams calls reheat(false) → the whole graph is awake again.
    expect(solver.isSettled()).toBe(false);
    expect((solver as any).awakeCount).toBe(20);
  });
});
