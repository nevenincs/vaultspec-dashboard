// Guard suite for the set-data swap classification (settle-on-swap audit): the
// pin-authoritative warm path may only pin survivors that (1) came from a SETTLED
// prior layout and (2) whose local edge topology is unchanged; the relax energy
// scales with the movable fraction; and a corpus switch is an explicit cold reset.

import { describe, expect, it } from "vitest";

import { classifySwap, type SwapEdge, type SwapInput } from "./swapClassifier";

const edge = (src: string, dst: string): SwapEdge => ({ src, dst });
const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `n${i}`);

function input(over: Partial<SwapInput>): SwapInput {
  return {
    nodeIds: ids(4),
    carriedIds: new Set(ids(4)),
    prevEdges: [],
    nextEdges: [],
    reflow: false,
    reset: false,
    priorSettled: true,
    warmStartAlpha: 0.3,
    coldAlpha: 1,
    ...over,
  };
}

describe("classifySwap — warm/cold gates", () => {
  it("a fully-carried same-edge update is warm with nothing movable at the warm alpha", () => {
    const edges = [edge("n0", "n1"), edge("n1", "n2")];
    const swap = classifySwap(input({ prevEdges: edges, nextEdges: edges }));
    expect(swap.warm).toBe(true);
    expect(swap.movableIds.size).toBe(0);
    expect(swap.startAlpha).toBeCloseTo(0.3, 5);
    expect(swap.continueSettle).toBe(false);
  });

  it("cold when carried falls below half on a non-reflow update", () => {
    const swap = classifySwap(input({ carriedIds: new Set(["n0"]) }));
    expect(swap.warm).toBe(false);
    expect(swap.startAlpha).toBeCloseTo(1, 5);
  });

  it("a reflow warms on ANY carried id; zero carried is cold even under reflow", () => {
    expect(
      classifySwap(input({ reflow: true, carriedIds: new Set(["n0"]) })).warm,
    ).toBe(true);
    expect(
      classifySwap(input({ reflow: true, carriedIds: new Set<string>() })).warm,
    ).toBe(false);
  });

  it("reset forces cold whatever the overlap — the corpus switch's explicit contract", () => {
    const swap = classifySwap(input({ reset: true }));
    expect(swap.warm).toBe(false);
    expect(classifySwap(input({ reset: true, reflow: true })).warm).toBe(false);
  });

  it("an empty incoming set is cold", () => {
    expect(classifySwap(input({ nodeIds: [] })).warm).toBe(false);
  });
});

describe("classifySwap — edge-topology awareness", () => {
  it("a same-id-set swap with a changed edge marks BOTH endpoints movable", () => {
    const swap = classifySwap(
      input({
        prevEdges: [edge("n0", "n1")],
        nextEdges: [edge("n1", "n2")],
      }),
    );
    expect(swap.warm).toBe(true);
    // n0/n1 lost an edge; n1/n2 gained one — all three must relax, n3 stays pinned.
    expect([...swap.movableIds].sort()).toEqual(["n0", "n1", "n2"]);
  });

  it("edge direction is irrelevant (undirected pair identity) and self-loops are ignored", () => {
    const swap = classifySwap(
      input({
        prevEdges: [edge("n0", "n1"), edge("n2", "n2")],
        nextEdges: [edge("n1", "n0"), edge("n3", "n3")],
      }),
    );
    expect(swap.movableIds.size).toBe(0);
  });

  it("a vanished edge whose endpoints left the set marks no survivor movable", () => {
    const swap = classifySwap(
      input({
        nodeIds: ["n0", "n1"],
        carriedIds: new Set(["n0", "n1"]),
        prevEdges: [edge("gone-a", "gone-b")],
        nextEdges: [],
      }),
    );
    expect(swap.movableIds.size).toBe(0);
  });
});

describe("classifySwap — proportional energy and settle continuation", () => {
  it("ramps the start alpha with the movable fraction toward cold", () => {
    // 1 carried survivor + 9 new nodes under reflow: movable 9/10 → 0.3 + 0.7×0.9.
    const nodeIds = ids(10);
    const swap = classifySwap(
      input({
        nodeIds,
        carriedIds: new Set(["n0"]),
        reflow: true,
      }),
    );
    expect(swap.warm).toBe(true);
    expect(swap.movableIds.size).toBe(9);
    expect(swap.startAlpha).toBeCloseTo(0.3 + 0.7 * 0.9, 5);
  });

  it("never exceeds the cold alpha", () => {
    const swap = classifySwap(
      input({
        nodeIds: ids(3),
        carriedIds: new Set(["n0", "n1", "n2"]),
        prevEdges: [edge("n0", "n1"), edge("n1", "n2"), edge("n2", "n0")],
        nextEdges: [],
        warmStartAlpha: 0.9,
      }),
    );
    expect(swap.startAlpha).toBeLessThanOrEqual(1);
  });

  it("an unsettled prior layout classifies as a settle continuation, never a pin", () => {
    const swap = classifySwap(input({ priorSettled: false }));
    expect(swap.warm).toBe(true);
    expect(swap.continueSettle).toBe(true);
  });
});
