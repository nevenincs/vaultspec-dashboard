import { describe, expect, it } from "vitest";

import type { SceneAnchor } from "../sceneController";
import { AnchorDriver, anchorsEqual } from "./anchors";

function harness(tracked: string[]) {
  const positions = new Map<string, { x: number; y: number }>();
  const emitted: [string, SceneAnchor | null][] = [];
  let scale = 1;
  let offsetX = 0;
  const driver = new AnchorDriver({
    trackedIds: () => tracked,
    positionOf: (id) => positions.get(id),
    worldToScreen: (wx, wy) => ({ x: wx * scale + offsetX, y: wy * scale }),
    scale: () => scale,
    emitAnchor: (id, anchor) => emitted.push([id, anchor]),
  });
  return {
    positions,
    emitted,
    driver,
    setScale: (s: number) => (scale = s),
    setOffset: (x: number) => (offsetX = x),
  };
}

describe("anchorsEqual", () => {
  it("compares within epsilon and handles null", () => {
    expect(anchorsEqual({ x: 0, y: 0, scale: 1 }, { x: 0.1, y: 0, scale: 1 })).toBe(
      true,
    );
    expect(anchorsEqual({ x: 0, y: 0, scale: 1 }, { x: 5, y: 0, scale: 1 })).toBe(
      false,
    );
    expect(anchorsEqual(null, null)).toBe(true);
    expect(anchorsEqual(null, { x: 0, y: 0, scale: 1 })).toBe(false);
  });
});

describe("AnchorDriver", () => {
  it("projects tracked nodes to screen space and dispatches", () => {
    const h = harness(["a"]);
    h.positions.set("a", { x: 10, y: 20 });
    h.setScale(2);
    h.driver.update();
    expect(h.emitted).toEqual([["a", { x: 20, y: 40, scale: 2 }]]);
  });

  it("dispatches only on actual change, not on every update", () => {
    const h = harness(["a"]);
    h.positions.set("a", { x: 10, y: 20 });
    h.driver.update();
    h.driver.update();
    expect(h.emitted.length).toBe(1);
    h.setOffset(100);
    h.driver.update();
    expect(h.emitted.length).toBe(2);
  });

  it("dispatches null once when a node leaves the stage", () => {
    const h = harness(["a"]);
    h.positions.set("a", { x: 0, y: 0 });
    h.driver.update();
    h.positions.delete("a");
    h.driver.update();
    h.driver.update();
    expect(h.emitted).toEqual([
      ["a", { x: 0, y: 0, scale: 1 }],
      ["a", null],
    ]);
  });

  it("forgets memoized anchors for untracked ids so re-tracking starts fresh", () => {
    const tracked: string[] = ["a"];
    const h = harness(tracked);
    h.positions.set("a", { x: 1, y: 1 });
    h.driver.update();
    tracked.length = 0;
    h.driver.update();
    tracked.push("a");
    h.driver.update();
    // Two dispatches for "a": initial and after re-track (same value).
    expect(h.emitted.length).toBe(2);
  });
});
