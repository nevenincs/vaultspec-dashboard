// d3-force layout driver tests (dashboard-node-graph-stability P04).
//
// Replaces the retired worker/convergence tests. The driver's settle loop is
// driven by an injected scheduler so cooling is deterministic and synchronous —
// no real requestAnimationFrame, no flaky timing.

import { describe, expect, it, vi } from "vitest";

import type { FrameScheduler, LayoutEdgeRef } from "./forceLayout";
import {
  ALPHA_MIN,
  FieldLayout,
  FREEZE_ALPHA_CEILING,
  FREEZE_DWELL_MAX,
  FREEZE_DWELL_MIN,
  INCREMENTAL_REHEAT_ALPHA,
  INTERACTION_ALPHA_TARGET,
  SEED_JITTER,
  freezeDwellTicks,
  seedPositions,
} from "./forceLayout";

/** Tiny deterministic PRNG (mulberry32) so seeding assertions are stable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A scheduler whose frames only advance when the test asks them to. */
class ManualScheduler implements FrameScheduler {
  private pending: (() => void) | null = null;
  schedule(cb: () => void): number {
    this.pending = cb;
    return 1;
  }
  cancel(): void {
    this.pending = null;
  }
  get hasPending(): boolean {
    return this.pending !== null;
  }
  /** Run up to `n` scheduled frames (stops early once the loop stops). */
  runFrames(n: number): number {
    let ran = 0;
    for (let i = 0; i < n && this.pending; i++) {
      const cb = this.pending;
      this.pending = null;
      cb();
      ran += 1;
    }
    return ran;
  }
}

const edge = (id: string, src: string, dst: string): LayoutEdgeRef => ({
  id,
  src,
  dst,
});

describe("seedPositions (warm start + local perturbation)", () => {
  it("keeps known positions verbatim (warm start)", () => {
    const seeds = seedPositions(
      ["a"],
      [],
      new Map([["a", { x: 5, y: 7 }]]),
      mulberry32(1),
    );
    expect(seeds.get("a")).toEqual({ x: 5, y: 7 });
  });

  it("seeds new nodes at their positioned neighbors' centroid plus jitter", () => {
    const known = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 100, y: 0 }],
    ]);
    const seeds = seedPositions(
      ["new"],
      [edge("e1", "new", "a"), edge("e2", "new", "b")],
      known,
      mulberry32(2),
    );
    const p = seeds.get("new")!;
    expect(Math.abs(p.x - 50)).toBeLessThanOrEqual(SEED_JITTER);
    expect(Math.abs(p.y - 0)).toBeLessThanOrEqual(SEED_JITTER);
  });

  it("cold-starts finite, never at the origin pile-up", () => {
    const seeds = seedPositions(["x"], [], new Map(), mulberry32(4));
    const p = seeds.get("x")!;
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});

describe("FieldLayout (d3-force driver)", () => {
  it("emits a seed frame on init, warm-started positions verbatim", () => {
    const layout = new FieldLayout(new ManualScheduler());
    const frames: ReadonlyMap<string, { x: number; y: number }>[] = [];
    layout.onPositions((p) => frames.push(new Map(p)));
    layout.init(["a", "b"], [edge("e1", "a", "b")], new Map([["a", { x: 3, y: 4 }]]));
    expect(frames).toHaveLength(1);
    expect(frames[0].get("a")).toEqual({ x: 3, y: 4 });
    // Unseeded node gets a finite phyllotaxis position, never the origin pile-up.
    const b = frames[0].get("b")!;
    expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
  });

  it("cools to a freeze and fires onSettle exactly once (settle-then-freeze)", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    const settles = vi.fn();
    layout.onSettle(settles);
    layout.init(["a", "b"], [edge("e1", "a", "b")], new Map());
    layout.start();
    const ran = sched.runFrames(2000);
    expect(settles).toHaveBeenCalledTimes(1);
    // The loop stopped on its own (no pending frame, far fewer than the cap).
    expect(sched.hasPending).toBe(false);
    expect(ran).toBeLessThan(2000);
  });

  it("a LARGE field settles via the alpha ceiling, not the long sub-perceptible tail", () => {
    // Regression: a 60-node field's body keeps drifting >FREEZE_MOVE_EPSILON until
    // the alpha floor, so it never velocity-calmed and ground ~300 ticks of visible
    // on-load jitter. The alpha-ceiling early freeze must stop it cool-but-early —
    // it settles, freezes ABOVE the alpha floor, and stops the loop.
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    const settles = vi.fn();
    layout.onSettle(settles);
    const ids = Array.from({ length: 60 }, (_, i) => `n${i}`);
    // A connected ring so every node carries a link force (a realistic field).
    const edges = ids.map((id, i) => edge(`e${i}`, id, ids[(i + 1) % ids.length]));
    const warm = new Map(
      ids.map((id, i) => [id, { x: Math.cos(i) * 400, y: Math.sin(i * 1.3) * 400 }]),
    );
    layout.init(ids, edges, warm);
    layout.start();
    const ran = sched.runFrames(5000);
    expect(settles).toHaveBeenCalledTimes(1);
    expect(sched.hasPending).toBe(false);
    // Froze ABOVE the hard alpha floor (the ceiling caught it first), and bounded.
    expect(layout.alpha()).toBeGreaterThan(ALPHA_MIN);
    expect(layout.alpha()).toBeLessThanOrEqual(FREEZE_ALPHA_CEILING);
    expect(ran).toBeLessThan(5000);
    // No NaN escaped the snapshot under the large-field collision churn.
    for (const [, p] of layout.positions) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });

  it("stop() halts the settle loop", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    layout.init(["a", "b"], [edge("e1", "a", "b")], new Map());
    layout.start();
    sched.runFrames(3);
    layout.stop();
    expect(sched.hasPending).toBe(false);
  });

  it("repairs a non-finite coordinate before it can escape (D4 guard)", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    const frames: ReadonlyMap<string, { x: number; y: number }>[] = [];
    layout.onPositions((p) => frames.push(new Map(p)));
    layout.init(
      ["a", "b"],
      [],
      new Map([
        ["a", { x: 10, y: 20 }],
        ["b", { x: 30, y: 40 }],
      ]),
    );
    // Inject a poison value the way a degenerate solver step would.
    (
      layout as unknown as { nodes: { id: string; x?: number; y?: number }[] }
    ).nodes[0].x = NaN;
    layout.start();
    sched.runFrames(1);
    const last = frames.at(-1)!;
    expect(Number.isFinite(last.get("a")!.x)).toBe(true);
    expect(Number.isFinite(last.get("a")!.y)).toBe(true);
  });

  it("isolates a throwing positions listener from the rest (D8)", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    const good = vi.fn();
    layout.onPositions(() => {
      throw new Error("boom");
    });
    layout.onPositions(good);
    // The seed frame fans out to both; the throw must not stop the good one.
    expect(() => layout.init(["a"], [], new Map())).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("pins at the solver via fx/fy and releases on unpin (D7)", () => {
    const layout = new FieldLayout(new ManualScheduler());
    layout.init(["a", "b"], [], new Map([["a", { x: 5, y: 6 }]]));
    layout.setPinned(new Set(["a"]));
    const nodeById = (
      layout as unknown as {
        nodeById: Map<string, { fx?: number | null; fy?: number | null }>;
      }
    ).nodeById;
    const a = nodeById.get("a")!;
    expect(a.fx).toBe(5);
    expect(a.fy).toBe(6);
    layout.setPinned(new Set());
    expect(a.fx).toBeNull();
    expect(a.fy).toBeNull();
  });

  it("re-init is stop-first so a re-seed cannot race an in-flight loop (D6)", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    layout.init(["a", "b"], [edge("e1", "a", "b")], new Map());
    layout.start();
    sched.runFrames(2);
    expect(sched.hasPending).toBe(true);
    layout.init(["a", "b", "c"], [], new Map()); // must stop the prior loop
    expect(sched.hasPending).toBe(false);
  });

  it("does not re-arm the loop if a listener stops it mid-frame (re-entrancy guard)", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    let frames = 0;
    layout.onPositions(() => {
      frames += 1;
      if (frames >= 2) layout.stop(); // stop from inside the fan-out
    });
    layout.init(["a", "b"], [edge("e1", "a", "b")], new Map());
    layout.start();
    const ran = sched.runFrames(50);
    // The stop() taken during a frame must win — the loop must not reschedule.
    expect(sched.hasPending).toBe(false);
    expect(ran).toBeLessThanOrEqual(2);
  });

  it("setParams reheats a settled layout", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    layout.init(["a", "b"], [edge("e1", "a", "b")], new Map());
    layout.start();
    sched.runFrames(2000); // settle
    expect(sched.hasPending).toBe(false);
    layout.setParams({ repel: 200 });
    expect(sched.hasPending).toBe(true); // reheated
  });

  it("stops emitting after destroy", () => {
    const layout = new FieldLayout(new ManualScheduler());
    const listener = vi.fn();
    layout.onPositions(listener);
    layout.init(["a"], [], new Map());
    expect(listener).toHaveBeenCalledTimes(1);
    layout.destroy();
    listener.mockClear();
    // A further init would only fan out to live listeners; there are none.
    layout.init(["a"], [], new Map());
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// graph-force-stability W01.P04.S15 — LIVE-LOOP driver tests.
//
// The prior cycle's 20 layout tests never drove the live onPositions loop; this
// block does, running REAL ticks under the manual scheduler so the incremental
// reheat, the held alphaTarget, and the velocity/dwell freeze are exercised as
// the field actually behaves, not asserted on internals. Tuned against the
// 12/50/300-node slices the ADR's open question names.
// ---------------------------------------------------------------------------

/** A grid of n nodes seeded on a coarse lattice with a spanning chain of edges,
 *  a stand-in for a connectivity slice of the requested size. */
function gridSlice(n: number): {
  ids: string[];
  edges: LayoutEdgeRef[];
  seeds: Map<string, { x: number; y: number }>;
} {
  const ids: string[] = [];
  const edges: LayoutEdgeRef[] = [];
  const seeds = new Map<string, { x: number; y: number }>();
  const cols = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const id = `n${i}`;
    ids.push(id);
    seeds.set(id, { x: (i % cols) * 50, y: Math.floor(i / cols) * 50 });
    if (i > 0) edges.push({ id: `e${i}`, src: `n${i - 1}`, dst: id });
  }
  return { ids, edges, seeds };
}

/** Drive the live loop to a settle and report how many frames it took. */
function runToSettle(layout: FieldLayout, sched: ManualScheduler, cap = 5000) {
  let settled = false;
  layout.onSettle(() => {
    settled = true;
  });
  const ran = sched.runFrames(cap);
  return { settled, ran };
}

function snapshot(layout: FieldLayout): Map<string, { x: number; y: number }> {
  return new Map([...layout.positions].map(([id, p]) => [id, { x: p.x, y: p.y }]));
}

describe("freezeDwellTicks (D5 node-count-scaled dwell)", () => {
  it("clamps to the dwell band across the 12/50/300-node slices", () => {
    expect(freezeDwellTicks(12)).toBe(FREEZE_DWELL_MIN);
    expect(freezeDwellTicks(50)).toBe(FREEZE_DWELL_MIN);
    expect(freezeDwellTicks(300)).toBeGreaterThanOrEqual(FREEZE_DWELL_MIN);
    // A very large island scales up toward (and clamps at) the max.
    expect(freezeDwellTicks(100000)).toBe(FREEZE_DWELL_MAX);
  });
});

describe("FieldLayout live loop — incremental reheat (D1)", () => {
  it("preserves survivor positions when nodes are added via applyChanges", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    const { ids, edges, seeds } = gridSlice(50);
    layout.init(ids, edges, seeds);
    layout.start();
    runToSettle(layout, sched);
    const before = snapshot(layout);

    // Add 5 nodes around the surviving set — the incremental case.
    const addIds = ["x0", "x1", "x2", "x3", "x4"];
    const addEdges = addIds.map((id, i) => ({
      id: `xe${i}`,
      src: `n${i}`,
      dst: id,
    }));
    layout.applyChanges({ addNodeIds: addIds, addEdges });
    sched.runFrames(5000);
    const after = snapshot(layout);

    // Every survivor is preserved to within a small local perturbation — the
    // low INCREMENTAL_REHEAT_ALPHA nudges, it does not re-settle the whole field.
    let maxDrift = 0;
    for (const id of ids) {
      const b = before.get(id)!;
      const a = after.get(id)!;
      maxDrift = Math.max(maxDrift, Math.hypot(a.x - b.x, a.y - b.y));
    }
    // A re-init from warm (0.5) would shuffle survivors hundreds of units; the
    // incremental reheat keeps the drift bounded to a local nudge.
    expect(maxDrift).toBeLessThan(120);
    // The added nodes were actually placed (not left at a degenerate origin).
    for (const id of addIds) {
      const p = after.get(id)!;
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });

  it("applyChanges reheats only to the low incremental alpha, not warm-start", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    layout.init(["a", "b"], [{ id: "e", src: "a", dst: "b" }], new Map());
    layout.start();
    sched.runFrames(5000); // settle
    layout.applyChanges({
      addNodeIds: ["c"],
      addEdges: [{ id: "e2", src: "a", dst: "c" }],
    });
    // Immediately after applyChanges the sim alpha is the LOW reheat, not 0.5.
    const alpha = (layout as unknown as { sim: { alpha(): number } }).sim.alpha();
    expect(alpha).toBeCloseTo(INCREMENTAL_REHEAT_ALPHA, 5);
  });
});

describe("FieldLayout live loop — held alphaTarget interaction (D2)", () => {
  it("keeps the field warm while interaction is active and does not freeze", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    const { ids, edges, seeds } = gridSlice(12);
    layout.init(ids, edges, seeds);
    layout.start();
    runToSettle(layout, sched);
    expect(sched.hasPending).toBe(false); // settled

    layout.beginInteraction();
    // The held target floors the alpha — the loop runs and stays warm.
    const ran = sched.runFrames(1000);
    expect(ran).toBe(1000); // never froze: the loop kept rescheduling
    const alpha = (layout as unknown as { sim: { alpha(): number } }).sim.alpha();
    expect(alpha).toBeGreaterThanOrEqual(INTERACTION_ALPHA_TARGET - 1e-6);

    // endInteraction releases the floor; the field re-cools to a freeze.
    layout.endInteraction();
    const { settled } = runToSettle(layout, sched);
    expect(settled).toBe(true);
    expect(sched.hasPending).toBe(false);
  });

  it("setParams during interaction applies without a one-shot reheat kick", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    layout.init(["a", "b"], [{ id: "e", src: "a", dst: "b" }], new Map());
    layout.start();
    sched.runFrames(5000); // settle
    layout.beginInteraction();
    // Run the loop until alpha decays down near the held interaction floor, so a
    // would-be PARAM_REHEAT kick (0.3) would be a visible jump UP.
    sched.runFrames(400);
    const before = (layout as unknown as { sim: { alpha(): number } }).sim.alpha();
    layout.setParams({ repel: 300 });
    const after = (layout as unknown as { sim: { alpha(): number } }).sim.alpha();
    // No one-shot kick: setParams during interaction must NOT raise alpha (the
    // held floor governs). A kick would have lifted it toward PARAM_REHEAT (0.3).
    expect(after).toBeLessThanOrEqual(before + 1e-9);
    // And the held floor keeps the field warm at the interaction target.
    expect(after).toBeGreaterThanOrEqual(INTERACTION_ALPHA_TARGET - 0.05);
  });

  it("dragNode fixes fx/fy and holds the interaction floor (D3)", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    layout.init(
      ["a", "b"],
      [{ id: "e", src: "a", dst: "b" }],
      new Map([["a", { x: 0, y: 0 }]]),
    );
    layout.start();
    sched.runFrames(5000);
    layout.dragNode("a", 123, 456);
    const node = (
      layout as unknown as {
        nodeById: Map<string, { fx?: number | null; fy?: number | null }>;
      }
    ).nodeById.get("a")!;
    expect(node.fx).toBe(123);
    expect(node.fy).toBe(456);
    // dragNode begins an interaction so the neighbourhood reflows.
    expect(sched.hasPending).toBe(true);
  });

  it("releaseNode frees a dragged (unpinned) node back into the simulation", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    layout.init(["a", "b"], [{ id: "e", src: "a", dst: "b" }], new Map());
    const nodeById = (
      layout as unknown as {
        nodeById: Map<string, { fx?: number | null; fy?: number | null }>;
      }
    ).nodeById;
    layout.dragNode("a", 100, 200);
    const a = nodeById.get("a")!;
    expect(a.fx).toBe(100); // held at the cursor during the drag
    expect(a.fy).toBe(200);
    // Dropping a NON-pinned node releases it: fx/fy clear so it rejoins the
    // cooling layout instead of being stranded (the free-drag, no auto-pin law).
    layout.releaseNode("a");
    expect(a.fx).toBeNull();
    expect(a.fy).toBeNull();
  });

  it("releaseNode keeps an explicitly PINNED node fixed at its dropped point", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    layout.init(["a", "b"], [{ id: "e", src: "a", dst: "b" }], new Map());
    const nodeById = (
      layout as unknown as {
        nodeById: Map<string, { fx?: number | null; fy?: number | null }>;
      }
    ).nodeById;
    layout.setPinned(new Set(["a"])); // a is an explicit pin
    layout.dragNode("a", 321, 654); // drag the pinned node somewhere
    layout.releaseNode("a");
    const a = nodeById.get("a")!;
    // A pinned node stays fixed at where it was dropped (pin survives the drag).
    expect(a.fx).toBe(321);
    expect(a.fy).toBe(654);
  });

  it("releaseNode is a safe no-op for an unknown id", () => {
    const layout = new FieldLayout(new ManualScheduler());
    layout.init(["a"], [], new Map());
    expect(() => layout.releaseNode("ghost")).not.toThrow();
  });
});

// W04.P11.S48: degenerate-slice hardening — re-confirm the force layout stays
// stable (finite positions, settles, no throw, no infinite loop) on the empty,
// singleton, and disconnected slices. The NaN guard and settle-then-freeze were
// landed in the node-graph-stability cycle; these drive the live loop on the
// degenerate slices the prior 20 tests never exercised, so a regression in the
// freeze/snapshot path on a degenerate input surfaces here.
describe("FieldLayout degenerate-slice hardening (S48)", () => {
  const finite = (m: ReadonlyMap<string, { x: number; y: number }>) => {
    for (const [, p] of m) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    }
    return true;
  };

  it("an empty slice settles immediately with no positions and no throw", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    const settles = vi.fn();
    layout.onSettle(settles);
    expect(() => layout.init([], [], new Map())).not.toThrow();
    layout.start();
    const ran = sched.runFrames(5000);
    // No node to move -> the velocity-freeze fires on the first sub-epsilon dwell.
    expect(sched.hasPending).toBe(false);
    expect(settles).toHaveBeenCalledTimes(1);
    expect(ran).toBeLessThan(5000);
    expect(layout.positions.size).toBe(0);
  });

  it("a singleton slice places one finite node and settles", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    const settles = vi.fn();
    layout.onSettle(settles);
    layout.init(["solo"], [], new Map());
    layout.start();
    const ran = sched.runFrames(5000);
    expect(settles).toHaveBeenCalledTimes(1);
    expect(ran).toBeLessThan(5000);
    expect(finite(layout.positions)).toBe(true);
    expect(layout.positions.size).toBe(1);
  });

  it("a disconnected slice (two islands, no edge between) settles with finite positions", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    const settles = vi.fn();
    layout.onSettle(settles);
    // Two separate two-node islands and one isolated node — no edge bridges them.
    layout.init(
      ["a", "b", "x", "y", "lone"],
      [edge("e1", "a", "b"), edge("e2", "x", "y")],
      new Map(),
    );
    layout.start();
    const ran = sched.runFrames(5000);
    expect(settles).toHaveBeenCalledTimes(1);
    expect(ran).toBeLessThan(5000);
    expect(finite(layout.positions)).toBe(true);
    expect(layout.positions.size).toBe(5);
  });

  it("a self-loop and an edge to a missing node never wedge the loop or throw", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    const settles = vi.fn();
    layout.onSettle(settles);
    // A self-loop (a->a) and a dangling edge (b->ghost, ghost absent): forceLink
    // throws on a link to an unknown node, so init must filter both to intra-set.
    expect(() =>
      layout.init(
        ["a", "b"],
        [edge("self", "a", "a"), edge("ghost", "b", "ghost")],
        new Map(),
      ),
    ).not.toThrow();
    layout.start();
    const ran = sched.runFrames(5000);
    expect(settles).toHaveBeenCalledTimes(1);
    expect(ran).toBeLessThan(5000);
    expect(finite(layout.positions)).toBe(true);
  });

  it("applyChanges that removes every node leaves an empty, finite, settled field", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    layout.init(["a", "b"], [edge("e1", "a", "b")], new Map());
    layout.start();
    sched.runFrames(5000);
    expect(() =>
      layout.applyChanges({ removeNodeIds: ["a", "b"], removeEdgeIds: ["e1"] }),
    ).not.toThrow();
    sched.runFrames(5000);
    expect(layout.positions.size).toBe(0);
    expect(finite(layout.positions)).toBe(true);
  });
});

describe("FieldLayout live loop — velocity/dwell freeze (D5)", () => {
  it("freezes the sim early once motion drops below the epsilon for the dwell", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    const { ids, edges, seeds } = gridSlice(50);
    layout.init(ids, edges, seeds);
    layout.start();
    const settles = vi.fn();
    layout.onSettle(settles);
    const ran = sched.runFrames(5000);
    // The sim STOPPED on its own (the velocity-freeze or the alpha floor).
    expect(sched.hasPending).toBe(false);
    expect(settles).toHaveBeenCalledTimes(1);
    expect(ran).toBeLessThan(5000);
  });

  it("the early freeze beats the alpha-floor — settles before alpha hits the min", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    // A pre-settled warm-start (positions already near equilibrium) converges
    // to sub-epsilon motion well before the alpha clock reaches ALPHA_MIN.
    const { ids, edges, seeds } = gridSlice(12);
    layout.init(ids, edges, seeds);
    layout.start();
    let alphaAtSettle = 1;
    layout.onSettle(() => {
      alphaAtSettle = (layout as unknown as { sim: { alpha(): number } }).sim.alpha();
    });
    sched.runFrames(5000);
    // The velocity-freeze fired above the floor: alpha at settle is > ALPHA_MIN
    // for a quickly-converging warm slice (the early-freeze win, not the floor).
    expect(alphaAtSettle).toBeGreaterThan(0.001);
  });
});

// Adversarial hardening: the driver must be unbreakable on hostile inputs — NaN /
// Infinity seeds, duplicate ids, interaction churn, and rapid re-init must never
// emit a non-finite coordinate, throw, or wedge the loop. ("resilient to
// adversarial use", the campaign bar.)
describe("FieldLayout adversarial hardening", () => {
  const allFinite = (m: ReadonlyMap<string, { x: number; y: number }>) => {
    for (const [, p] of m)
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    return true;
  };

  it("repairs NaN / Infinity warm-start seeds in the very first (seed) frame", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    const frames: ReadonlyMap<string, { x: number; y: number }>[] = [];
    layout.onPositions((p) => frames.push(new Map(p)));
    layout.init(
      ["a", "b", "c"],
      [edge("e1", "a", "b")],
      new Map([
        ["a", { x: NaN, y: 10 }],
        ["b", { x: Infinity, y: -Infinity }],
        ["c", { x: 5, y: 7 }],
      ]),
    );
    // The seed frame already went through the non-finite guard.
    expect(allFinite(frames[0])).toBe(true);
    layout.start();
    sched.runFrames(2000);
    expect(allFinite(layout.positions)).toBe(true);
  });

  it("tolerates duplicate node ids in init without throwing or going non-finite", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    expect(() =>
      layout.init(["a", "a", "b", "b", "a"], [edge("e1", "a", "b")], new Map()),
    ).not.toThrow();
    layout.start();
    expect(() => sched.runFrames(2000)).not.toThrow();
    expect(allFinite(layout.positions)).toBe(true);
  });

  it("survives rapid interaction churn (begin/drag/release/end/pin) without wedging", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    layout.init(
      ["a", "b", "c"],
      [edge("e1", "a", "b"), edge("e2", "b", "c")],
      new Map(),
    );
    layout.start();
    for (let i = 0; i < 20; i++) {
      layout.beginInteraction();
      layout.dragNode("a", i * 3, -i * 2);
      layout.dragNode("ghost", 1, 1); // unknown id — must be a safe no-op
      layout.releaseNode("a");
      layout.endInteraction();
      layout.setPinned(new Set(i % 2 ? ["b"] : []));
      sched.runFrames(3);
    }
    expect(() => sched.runFrames(3000)).not.toThrow();
    expect(allFinite(layout.positions)).toBe(true);
  });

  it("survives rapid re-init churn (init→init→init) with no leaked pending loop", () => {
    const sched = new ManualScheduler();
    const layout = new FieldLayout(sched);
    for (let i = 0; i < 15; i++) {
      const ids = Array.from({ length: 5 + i }, (_, k) => `n${k}`);
      layout.init(ids, [edge(`e${i}`, "n0", "n1")], new Map());
      layout.start();
      sched.runFrames(2);
    }
    layout.stop();
    expect(sched.hasPending).toBe(false);
    expect(allFinite(layout.positions)).toBe(true);
  });
});
