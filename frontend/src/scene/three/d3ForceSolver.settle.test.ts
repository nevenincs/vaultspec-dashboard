// Settle-probe GUARD suite — resurrected diagnostic (ADR
// `2026-07-02-graph-implementation-review-adr`, remediation item R4).
//
// The graph's "settled" state is NOT a force fixed point: forceCollide is
// deliberately not alpha-scaled, so the field never fully cools; the layout reads
// as stable ONLY because tick() freezes the whole graph at alphaMin (sleepAll pins
// every node) and every warm path pins carried survivors. Option B of the ADR
// ACCEPTS this freeze-at-alphaMin + pin-authoritative model as the intended design
// and mandates PERMANENT guards for its invariants — the since-removed settle-probe
// measurements, returned as build-gated tests rather than comment-reading vigilance.
//
// These four guards pin the post-valve-closure (WI-2 / R1-R3) contract:
//   (a) an energy-neutral resume (tick with NO reheat) moves a settled layout < ε —
//       reheat/reheatNow is the ONLY heat-pump path (GIR-002 closed);
//   (b) reheatGentle(a) NEVER lowers the current temperature (GIR-003 discipline);
//   (c) a same-id-set warm update (prewarmReflow, no new nodes) does ZERO ticks and
//       moves nothing (the prewarmReflow authority guarantee);
//   (d) the alphaMin freeze fires — isSettled() holds with nothing awake, and a
//       subsequent tick moves nothing (the load-bearing stability mechanism).
//   (e) a zero-movable reflow on a FRESH solver clamps alpha to the settled floor,
//       so the next reheatGentle stays gentle (settle-on-swap audit,
//       stale-alpha-one-after-same-id-reflow).
//
// White-box: solver internals (awake/awakeCount/localMode/nodes) are TS-private and
// read via `(solver as any).<field>`, matching d3ForceSolver.test.ts.

import { describe, expect, it } from "vitest";

import {
  D3_FORCE_DEFAULTS,
  D3ForceSolver,
  type D3ForceParams,
  type SolverEdge,
} from "./d3ForceSolver";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- helpers (mirrors d3ForceSolver.test.ts) -------------------------------

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

function maxMove(a: { x: number; y: number }[], b: { x: number; y: number }[]): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    m = Math.max(m, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y));
  }
  return m;
}

// The freeze residue: the non-alpha-scaled collide force leaves ~1e-5 world-unit
// float noise on a "settled" layout. ε = 1e-3 is a thousandth of a world unit —
// far below the node radius (4) and link distance (40), i.e. imperceptible.
const EPSILON = 1e-3;

// ---- (a) energy-neutral resume ---------------------------------------------

describe("D3ForceSolver settle-probe — (a) energy-neutral resume", () => {
  it("ticking a settled layout WITHOUT reheat moves every node < ε and stays settled", () => {
    // This is the GIR-002 contract: threeField.resume() (set-simulation-active:true)
    // just re-runs the tick loop — it must NOT call solver.reheat. A settled solver
    // has every node asleep+pinned, so plain ticking discharges no energy.
    const solver = makeSolver(50, ringEdges(50));
    solver.prewarm();
    expect(solver.isSettled()).toBe(true);
    expect((solver as any).awakeCount).toBe(0);

    const before = positions(solver);
    // Simulate the resume loop running many frames with no re-energise.
    for (let t = 0; t < 60; t++) solver.tick();

    const after = positions(solver);
    expect(maxMove(before, after)).toBeLessThan(EPSILON);
    // Resume pumps no heat: the field stays asleep the whole time.
    expect((solver as any).awakeCount).toBe(0);
    expect(solver.isSettled()).toBe(true);
  });

  it("reheat IS the only heat-pump: reheat re-energises where resume does not", () => {
    // The contrast that makes (a) meaningful — an explicit reheat (reheatNow's path)
    // DOES wake the graph and move it, proving the energy-neutral resume above is a
    // real, distinct discipline rather than a no-op solver.
    const solver = makeSolver(30, ringEdges(30));
    solver.prewarm();
    const before = positions(solver);

    solver.reheat(true); // COLD_ALPHA = 1 — the explicit heat pump
    expect((solver as any).awakeCount).toBe(30);
    expect(solver.isSettled()).toBe(false);
    for (let t = 0; t < 40; t++) solver.tick();

    // A reheat visibly reshapes the layout (unlike the energy-neutral resume).
    expect(maxMove(before, positions(solver))).toBeGreaterThan(EPSILON);
  });
});

// ---- (b) reheatGentle never lowers the current alpha -----------------------

describe("D3ForceSolver settle-probe — (b) reheatGentle never lowers alpha", () => {
  it("a below-current gentle kick leaves the temperature untouched", () => {
    // reheatGentle scales alpha to max(current, kick), so a small kick during a hot
    // settle cannot COOL the layout (the GIR-003 no-violent-retune discipline's
    // companion: gentle is never a downward step either).
    const solver = makeSolver(40, ringEdges(40));
    solver.reheat(true); // alpha = COLD_ALPHA = 1
    expect(solver.alpha()).toBeCloseTo(1, 5);

    solver.reheatGentle(0.15); // GENTLE_REHEAT_ALPHA — well below 1
    expect(solver.alpha()).toBeCloseTo(1, 5); // unchanged, not lowered

    solver.reheat(false); // alpha = WARM_ALPHA = 0.5
    solver.reheatGentle(0.02); // schema minimum — still below current
    expect(solver.alpha()).toBeCloseTo(0.5, 5);
  });

  it("an above-current gentle kick raises the temperature to exactly the kick", () => {
    const solver = makeSolver(40, ringEdges(40));
    solver.prewarm(); // settle → alpha decayed below alphaMin (0.005)
    expect(solver.alpha()).toBeLessThan(0.005);

    solver.reheatGentle(0.15);
    // Raised to the kick, never overshooting to WARM_ALPHA (the violent old default).
    expect(solver.alpha()).toBeCloseTo(0.15, 5);
    // A gentle reheat returns to the global unpinned settle (every node free).
    expect((solver as any).awakeCount).toBe(40);
    expect((solver as any).localMode).toBe(false);
  });
});

// ---- (c) same-id-set warm update does zero ticks + zero movement -----------

describe("D3ForceSolver settle-probe — (c) same-id-set update is authoritative", () => {
  it("prewarmReflow with no new nodes runs ZERO ticks and moves nothing", () => {
    // Every warm data path (ego expansion, live delta, same-scope re-fetch) routes
    // through prewarmReflow. A re-fetch whose id set is unchanged has no new nodes,
    // so the settled layout is authoritative: it runs zero ticks and holds exactly.
    const solver = makeSolver(45, ringEdges(45));
    solver.prewarm();
    const before = positions(solver);

    const ticks = solver.prewarmReflow(() => false); // nothing is new
    expect(ticks).toBe(0);

    const after = positions(solver);
    expect(maxMove(before, after)).toBeLessThan(EPSILON);
    expect(solver.isSettled()).toBe(true);

    // Survivors stay pinned-and-asleep (the asleep ⇔ pinned invariant is preserved).
    const nodes = (solver as any).nodes as { fx: number | null; fy: number | null }[];
    for (let i = 0; i < 45; i++) {
      expect(nodes[i].fx).not.toBeNull();
      expect(nodes[i].fy).not.toBeNull();
    }
  });
});

// ---- (d) the alphaMin freeze fires -----------------------------------------

describe("D3ForceSolver settle-probe — (d) the alphaMin freeze fires", () => {
  it("freezes the whole graph in one tick at alphaMin, then holds still", () => {
    // The load-bearing stability mechanism: the global settle never sleeps nodes
    // individually (that is drag/local-mode behaviour), so once alpha decays below
    // alphaMin the guard in tick() calls sleepAll() and the whole field drops from
    // fully-awake to fully-asleep in a SINGLE tick. That freeze is what converts the
    // never-fully-cooling collide residue into apparent stillness.
    const n = 40;
    const solver = makeSolver(n, ringEdges(n), { alphaDecay: 0.05, alphaMin: 0.005 });
    solver.reheat(true); // COLD_ALPHA = 1, whole graph awake
    expect((solver as any).awakeCount).toBe(n);

    let prevAwake = (solver as any).awakeCount as number;
    let froze = false;
    for (let t = 0; t < 500; t++) {
      const m = solver.tick();
      if (m.awake === 0) {
        // The freeze fired this tick: it happened at/under the alphaMin threshold,
        // and it dropped the FULL awake set in one step (no per-node sleep in the
        // global settle).
        expect(solver.alpha()).toBeLessThan(0.005);
        expect(prevAwake).toBe(n);
        froze = true;
        break;
      }
      prevAwake = m.awake;
    }
    expect(froze).toBe(true);

    // Post-freeze: settled, nothing awake, everything pinned.
    expect(solver.isSettled()).toBe(true);
    expect((solver as any).awakeCount).toBe(0);
    const nodes = (solver as any).nodes as { fx: number | null; fy: number | null }[];
    for (let i = 0; i < n; i++) {
      expect(nodes[i].fx).not.toBeNull();
      expect(nodes[i].fy).not.toBeNull();
    }

    // A subsequent tick on the frozen field moves nothing (the freeze holds).
    const before = positions(solver);
    for (let t = 0; t < 20; t++) solver.tick();
    expect(maxMove(before, positions(solver))).toBeLessThan(EPSILON);
    expect((solver as any).awakeCount).toBe(0);
  });
});

// ---- (e) zero-movable reflow on a fresh solver clamps alpha ------------------

describe("D3ForceSolver settle-probe — (e) movable===0 reflow clamps alpha", () => {
  it("leaves a fresh instance at the settled floor so the next gentle reheat stays gentle", () => {
    // Production path: threeField.setData constructs a NEW solver per swap, seeds the
    // carried positions, and prewarmReflow is the FIRST energy call on the instance.
    // With nothing movable it must clamp alpha to <= alphaMin — otherwise the sim
    // still holds d3's constructor alpha 1 and the next reheatGentle
    // (max(current, kick)) reads that 1 as the current temperature and cold-explodes
    // instead of nudging (the guard-(c) shape pre-runs prewarm(), which hid this).
    const n = 30;
    const solver = makeSolver(n, ringEdges(n));
    solver.seed((i) => ({ x: (i % 6) * 20, y: Math.floor(i / 6) * 20 }));

    const ticks = solver.prewarmReflow(() => false); // nothing is new
    expect(ticks).toBe(0);
    expect(solver.isSettled()).toBe(true);
    expect(solver.alpha()).toBeLessThanOrEqual(0.005);

    solver.reheatGentle(0.15);
    expect(solver.alpha()).toBeCloseTo(0.15, 5); // the kick, never the cold 1
  });
});
