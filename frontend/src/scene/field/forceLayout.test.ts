// d3-force layout driver tests (dashboard-node-graph-stability P04).
//
// Replaces the retired worker/convergence tests. The driver's settle loop is
// driven by an injected scheduler so cooling is deterministic and synchronous —
// no real requestAnimationFrame, no flaky timing.

import { describe, expect, it, vi } from "vitest";

import type { FrameScheduler, LayoutEdgeRef } from "./forceLayout";
import { FieldLayout, SEED_JITTER, seedPositions } from "./forceLayout";

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
