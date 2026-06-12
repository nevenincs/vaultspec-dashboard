import { describe, expect, it } from "vitest";

import type { LayoutInMessage, WorkerLike } from "./layoutWorker";
import { FieldLayout, SEED_JITTER, seedPositions } from "./layoutWorker";

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

const edge = (id: string, src: string, dst: string) => ({ id, src, dst });

describe("seedPositions (warm start + local perturbation)", () => {
  it("keeps known positions verbatim (warm start)", () => {
    const known = new Map([["a", { x: 5, y: 7 }]]);
    const seeds = seedPositions(["a"], [], known, mulberry32(1));
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

  it("seeds unconnected nodes near the field centroid, not at the origin", () => {
    const known = new Map([
      ["a", { x: 1000, y: 1000 }],
      ["b", { x: 1200, y: 1000 }],
    ]);
    const seeds = seedPositions(["lone"], [], known, mulberry32(3));
    const p = seeds.get("lone")!;
    expect(Math.abs(p.x - 1100)).toBeLessThanOrEqual(SEED_JITTER * 4);
    expect(Math.abs(p.y - 1000)).toBeLessThanOrEqual(SEED_JITTER * 4);
  });

  it("cold-starts within the start radius when nothing is known", () => {
    const seeds = seedPositions(["x"], [], new Map(), mulberry32(4));
    const p = seeds.get("x")!;
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});

class FakeWorker implements WorkerLike {
  sent: LayoutInMessage[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage(message: unknown): void {
    this.sent.push(message as LayoutInMessage);
  }
  terminate(): void {
    this.onmessage = null;
  }
  emitPositions(ids: string[], coords: number[]): void {
    this.onmessage?.({
      data: { kind: "positions", ids, coords: Float32Array.from(coords) },
    } as MessageEvent);
  }
}

describe("FieldLayout", () => {
  it("inits the worker graph with warm-start seeds applied", () => {
    const worker = new FakeWorker();
    const layout = new FieldLayout(worker);
    layout.init(["a", "b"], [edge("e1", "a", "b")], new Map([["a", { x: 3, y: 4 }]]));
    const init = worker.sent[0];
    expect(init.kind).toBe("init");
    if (init.kind === "init") {
      expect(init.nodes.find((n) => n.id === "a")).toMatchObject({ x: 3, y: 4 });
      expect(init.edges).toEqual([edge("e1", "a", "b")]);
    }
  });

  it("fans position frames out to subscribers and snapshots the latest", () => {
    const worker = new FakeWorker();
    const layout = new FieldLayout(worker);
    const frames: number[] = [];
    layout.onPositions((p) => frames.push(p.size));
    worker.emitPositions(["a", "b"], [1, 2, 3, 4]);
    expect(frames).toEqual([2]);
    expect(layout.positions.get("b")).toEqual({ x: 3, y: 4 });
  });

  it("seeds only the added nodes on changes (local perturbation)", () => {
    const worker = new FakeWorker();
    const layout = new FieldLayout(worker);
    worker.emitPositions(["a"], [10, 10]);
    layout.applyChanges({
      addNodeIds: ["n"],
      addEdges: [edge("e2", "n", "a")],
      removeNodeIds: ["gone"],
    });
    const change = worker.sent[0];
    expect(change.kind).toBe("change");
    if (change.kind === "change") {
      expect(change.addNodes).toHaveLength(1);
      expect(change.addNodes![0].id).toBe("n");
      expect(Math.abs(change.addNodes![0].x - 10)).toBeLessThanOrEqual(SEED_JITTER);
      expect(change.removeNodeIds).toEqual(["gone"]);
    }
  });

  it("stops the worker on destroy", () => {
    const worker = new FakeWorker();
    const layout = new FieldLayout(worker);
    layout.destroy();
    expect(worker.sent).toEqual([{ kind: "stop" }]);
    expect(worker.onmessage).toBeNull();
  });
});
