// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  actionForKey,
  bindGraphWalk,
  egoNeighbors,
  nextFocus,
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
  it("maps arrows and Tab to a directional walk, tagging the source", () => {
    expect(actionForKey({ key: "ArrowRight", shiftKey: false })).toEqual({
      kind: "walk",
      direction: "forward",
      via: "arrow",
    });
    expect(actionForKey({ key: "ArrowUp", shiftKey: false })).toEqual({
      kind: "walk",
      direction: "backward",
      via: "arrow",
    });
    expect(actionForKey({ key: "Tab", shiftKey: true })).toEqual({
      kind: "walk",
      direction: "backward",
      via: "tab",
    });
  });

  it("maps Enter/e/Escape to open/expand/clear", () => {
    expect(actionForKey({ key: "Enter", shiftKey: false })).toEqual({ kind: "open" });
    expect(actionForKey({ key: "e", shiftKey: false })).toEqual({ kind: "expand" });
    expect(actionForKey({ key: "Escape", shiftKey: false })).toEqual({ kind: "clear" });
  });

  it("ignores keys the canvas does not own", () => {
    expect(actionForKey({ key: "z", shiftKey: false })).toBeNull();
  });
});

describe("bindGraphWalk (instant, store-driven, no animation)", () => {
  let teardown: (() => void) | null = null;

  afterEach(() => {
    teardown?.();
    teardown = null;
    document.body.innerHTML = "";
  });

  function harness(initial: string | null) {
    let selected = initial;
    const calls = {
      select: vi.fn((id: string | null) => {
        selected = id;
      }),
      open: vi.fn(),
      expand: vi.fn(),
    };
    const handlers: GraphWalkHandlers = {
      selectedId: () => selected,
      select: calls.select,
      open: calls.open,
      expand: calls.expand,
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    teardown = bindGraphWalk(host, () => GRAPH, handlers);
    return { host, calls };
  }

  function press(host: HTMLElement, key: string, shiftKey = false) {
    const e = new KeyboardEvent("keydown", {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    host.dispatchEvent(e);
    return e;
  }

  it("walks the focus across edges via arrow keys", () => {
    const { host, calls } = harness("b");
    press(host, "ArrowRight"); // b's ego forward → a
    expect(calls.select).toHaveBeenCalledWith("a");
  });

  it("Tab steps the ego ring once focused (walks within the graph)", () => {
    const { host, calls } = harness("b");
    const e = press(host, "Tab"); // b's ego forward → a
    expect(calls.select).toHaveBeenCalledWith("a");
    expect(e.defaultPrevented).toBe(true);
  });

  it("does NOT trap Tab when nothing is focused — focus can escape the widget", () => {
    const { host, calls } = harness(null);
    const e = press(host, "Tab");
    // No selection to walk from → Tab bubbles uninterrupted (WCAG no-keyboard-trap).
    expect(calls.select).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it("arrow keys still seed the field when nothing is focused", () => {
    const { host, calls } = harness(null);
    press(host, "ArrowRight"); // seeds the first node in id order
    expect(calls.select).toHaveBeenCalledWith("a");
  });

  it("Enter opens the focused node, e expands it, Escape clears", () => {
    const { host, calls } = harness("c");
    press(host, "Enter");
    expect(calls.open).toHaveBeenCalledWith("c");
    press(host, "e");
    expect(calls.expand).toHaveBeenCalledWith("c");
    press(host, "Escape");
    expect(calls.select).toHaveBeenCalledWith(null);
  });

  it("does not hijack keys while a form control inside the host has focus", () => {
    const { host, calls } = harness("a");
    const input = document.createElement("input");
    host.appendChild(input);
    input.focus();
    press(input, "ArrowRight");
    expect(calls.select).not.toHaveBeenCalled();
  });

  it("open/expand are no-ops with nothing focused", () => {
    const { host, calls } = harness(null);
    press(host, "Enter");
    press(host, "e");
    expect(calls.open).not.toHaveBeenCalled();
    expect(calls.expand).not.toHaveBeenCalled();
  });
});
