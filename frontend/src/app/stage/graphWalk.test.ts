import { describe, expect, it } from "vitest";

import {
  actionForKey,
  egoNeighbors,
  nextFocus,
  runGraphWalkAction,
  type GraphWalkHandlers,
  type WalkGraph,
} from "./graphWalk";

// A small diamond graph: a—b, a—c, b—d, c—d. The ego of `a` is {b, c}.
const GRAPH: WalkGraph = {
  nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
  edges: [
    { src: "a", dst: "b" },
    { src: "a", dst: "c" },
    { src: "b", dst: "d" },
    { src: "c", dst: "d" },
  ],
};

describe("egoNeighbors (the walkable cohort)", () => {
  it("returns the 1-hop set in stable id order, both edge directions", () => {
    expect(egoNeighbors(GRAPH, "a")).toEqual(["b", "c"]);
    expect(egoNeighbors(GRAPH, "d")).toEqual(["b", "c"]);
  });

  it("drops self-loops and endpoints absent from the slice", () => {
    const g: WalkGraph = {
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [
        { src: "a", dst: "a" }, // self-loop
        { src: "a", dst: "b" },
        { src: "a", dst: "ghost" }, // dangling
      ],
    };
    expect(egoNeighbors(g, "a")).toEqual(["b"]);
  });
});

describe("nextFocus (walking the graph by edges)", () => {
  it("seeds at the first id when nothing is focused", () => {
    expect(nextFocus(GRAPH, null, "forward")).toBe("a");
    expect(nextFocus(GRAPH, "ghost", "forward")).toBe("a");
  });

  it("steps forward and backward through the ego ring, wrapping at the ends", () => {
    // From b: ego is {a, d}. Forward → a, backward → d (wrap).
    expect(nextFocus(GRAPH, "b", "forward")).toBe("a");
    expect(nextFocus(GRAPH, "b", "backward")).toBe("d");
  });

  it("holds focus when the node has no neighbors", () => {
    const g: WalkGraph = { nodes: [{ id: "lone" }], edges: [] };
    expect(nextFocus(g, "lone", "forward")).toBe("lone");
  });

  it("returns null for an empty graph", () => {
    expect(nextFocus({ nodes: [], edges: [] }, null, "forward")).toBeNull();
  });
});

describe("actionForKey (the keyboard verb table)", () => {
  it("maps arrows to a directional walk", () => {
    expect(actionForKey({ key: "ArrowRight" })).toEqual({
      kind: "walk",
      direction: "forward",
    });
    expect(actionForKey({ key: "ArrowDown" })).toEqual({
      kind: "walk",
      direction: "forward",
    });
    expect(actionForKey({ key: "ArrowUp" })).toEqual({
      kind: "walk",
      direction: "backward",
    });
    expect(actionForKey({ key: "ArrowLeft" })).toEqual({
      kind: "walk",
      direction: "backward",
    });
  });

  it("maps Enter/e/Escape to open/expand/clear", () => {
    expect(actionForKey({ key: "Enter" })).toEqual({ kind: "open" });
    expect(actionForKey({ key: "e" })).toEqual({ kind: "expand" });
    expect(actionForKey({ key: "Escape" })).toEqual({ kind: "clear" });
  });

  it("does NOT map Tab — it is left to browser focus traversal (no keyboard trap)", () => {
    expect(actionForKey({ key: "Tab" })).toBeNull();
  });

  it("ignores keys the canvas does not own", () => {
    expect(actionForKey({ key: "z" })).toBeNull();
  });
});

// The per-action runner that the canvas-context keymap resolvers call (the logic
// that the old host-listener `bindGraphWalk` switch used to perform). Ported from
// the former `bindGraphWalk` behavioral tests so the same behaviors stay covered,
// now exercised directly against the pure runner with no DOM dependency.
describe("runGraphWalkAction (instant, store-driven, no animation)", () => {
  function harness(initial: string | null) {
    let selected = initial;
    const selectedCalls: unknown[] = [];
    const opened: unknown[] = [];
    const expanded: unknown[] = [];
    const calls = {
      select: (id: unknown) => {
        selected = typeof id === "string" || id === null ? id : selected;
        selectedCalls.push(id);
      },
      open: (id: unknown) => opened.push(id),
      expand: (id: unknown) => expanded.push(id),
    };
    const handlers: GraphWalkHandlers = {
      selectedId: () => selected,
      select: calls.select,
      open: calls.open,
      expand: calls.expand,
    };
    return { handlers, selectedCalls, opened, expanded };
  }

  it("walks the focus across edges (consumes the key)", () => {
    const { handlers, selectedCalls } = harness("b");
    const consumed = runGraphWalkAction(
      { kind: "walk", direction: "forward" },
      GRAPH,
      handlers,
    ); // b's ego forward → a
    expect(selectedCalls).toEqual(["a"]);
    expect(consumed).toBe(true);
  });

  it("seeds the field when nothing is focused (an arrow enters the unfocused field)", () => {
    const { handlers, selectedCalls } = harness(null);
    const consumed = runGraphWalkAction(
      { kind: "walk", direction: "forward" },
      GRAPH,
      handlers,
    ); // seeds the first node in id order
    expect(selectedCalls).toEqual(["a"]);
    expect(consumed).toBe(true);
  });

  it("walk no-ops (does not consume) on an empty graph", () => {
    const { handlers, selectedCalls } = harness(null);
    const consumed = runGraphWalkAction(
      { kind: "walk", direction: "forward" },
      { nodes: [], edges: [] },
      handlers,
    );
    expect(selectedCalls).toEqual([]);
    expect(consumed).toBe(false);
  });

  it("Enter opens the focused node, e expands it, Escape clears", () => {
    const { handlers, selectedCalls, opened, expanded } = harness("c");
    expect(runGraphWalkAction({ kind: "open" }, GRAPH, handlers)).toBe(true);
    expect(opened).toEqual(["c"]);
    expect(runGraphWalkAction({ kind: "expand" }, GRAPH, handlers)).toBe(true);
    expect(expanded).toEqual(["c"]);
    expect(runGraphWalkAction({ kind: "clear" }, GRAPH, handlers)).toBe(true);
    expect(selectedCalls).toEqual([null]);
  });

  it("open/expand are no-ops (do not consume) with nothing focused", () => {
    const { handlers, opened, expanded } = harness(null);
    expect(runGraphWalkAction({ kind: "open" }, GRAPH, handlers)).toBe(false);
    expect(runGraphWalkAction({ kind: "expand" }, GRAPH, handlers)).toBe(false);
    expect(opened).toEqual([]);
    expect(expanded).toEqual([]);
  });

  it("clear always consumes the key, even with nothing focused", () => {
    const { handlers, selectedCalls } = harness(null);
    expect(runGraphWalkAction({ kind: "clear" }, GRAPH, handlers)).toBe(true);
    expect(selectedCalls).toEqual([null]);
  });
});
