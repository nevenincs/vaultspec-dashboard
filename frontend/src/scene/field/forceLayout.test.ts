// d3-force layout driver tests (dashboard-node-graph-stability P04).
//
// Replaces the retired worker/convergence tests. The driver's settle loop is
// driven by an injected scheduler so cooling is deterministic and synchronous —
// no real requestAnimationFrame, no flaky timing.

import { describe, expect, it, vi } from "vitest";

import type { FrameScheduler, LayoutEdgeRef } from "./forceLayout";
import {
  FieldLayout,
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
