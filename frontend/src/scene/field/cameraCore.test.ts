import { describe, expect, it } from "vitest";

import type { SceneEvent } from "../sceneController";

import {
  DOCUMENT_LEVEL_SCALE,
  DRAG_THRESHOLD_PX,
  FEATURE_LEVEL_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  PointerGestures,
  SpatialHitTester,
  clampScale,
  screenToWorld,
  semanticLevel,
  worldToScreen,
  zoomAt,
} from "./cameraCore";

describe("semanticLevel", () => {
  it("maps geometric scale onto the three discrete levels", () => {
    expect(semanticLevel(FEATURE_LEVEL_SCALE - 0.01)).toBe("constellation");
    expect(semanticLevel(FEATURE_LEVEL_SCALE)).toBe("feature");
    expect(semanticLevel(DOCUMENT_LEVEL_SCALE)).toBe("document");
  });
});

describe("camera math", () => {
  it("clamps scale to the working band", () => {
    expect(clampScale(0)).toBe(MIN_SCALE);
    expect(clampScale(100)).toBe(MAX_SCALE);
  });

  it("zooms anchored at the cursor: the world point stays put", () => {
    const state = { x: 10, y: 20, scale: 1 };
    const anchor = { sx: 100, sy: 80 };
    const before = screenToWorld(state, anchor.sx, anchor.sy);
    const zoomed = zoomAt(state, anchor.sx, anchor.sy, 2);
    const after = screenToWorld(zoomed, anchor.sx, anchor.sy);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomed.scale).toBe(2);
  });

  it("round-trips screen and world coordinates", () => {
    const state = { x: -50, y: 30, scale: 1.5 };
    const w = screenToWorld(state, 200, 100);
    const s = worldToScreen(state, w.x, w.y);
    expect(s.x).toBeCloseTo(200);
    expect(s.y).toBeCloseTo(100);
  });
});

describe("SpatialHitTester", () => {
  it("finds the nearest node within the radius across cell borders", () => {
    const hits = new SpatialHitTester(32);
    hits.rebuild([
      ["near", { x: 31, y: 0 }],
      ["far", { x: 60, y: 0 }],
    ]);
    expect(hits.hitTest(33, 0, 10)).toBe("near");
    expect(hits.hitTest(58, 0, 10)).toBe("far");
    expect(hits.hitTest(200, 200, 10)).toBeNull();
  });
});

describe("PointerGestures", () => {
  interface DragLog {
    to: [string, number, number][];
    ends: [string, boolean][];
  }
  function harness(hit: (x: number, y: number) => string | null) {
    const events: SceneEvent[] = [];
    const pans: [number, number][] = [];
    const drag: DragLog = { to: [], ends: [] };
    const gestures = new PointerGestures({
      emit: (e) => events.push(e),
      panBy: (dx, dy) => pans.push([dx, dy]),
      hitTestScreen: hit,
      // Identity screen→world so the node-drag world coords are predictable.
      screenToWorld: (sx, sy) => ({ x: sx, y: sy }),
      nodeDragTo: (id, wx, wy) => drag.to.push([id, wx, wy]),
      nodeDragEnd: (id, moved) => drag.ends.push([id, moved]),
    });
    return { events, pans, drag, gestures };
  }

  it("pans on EMPTY-CANVAS drag and suppresses the click (D3)", () => {
    // Empty canvas on down → camera pan, exactly as before the node-drag branch.
    const { events, pans, drag, gestures } = harness(() => null);
    gestures.pointerDown({ x: 0, y: 0 });
    gestures.pointerMove({ x: DRAG_THRESHOLD_PX + 2, y: 0 });
    gestures.pointerMove({ x: DRAG_THRESHOLD_PX + 10, y: 5 });
    gestures.pointerUp({ x: DRAG_THRESHOLD_PX + 10, y: 5 });
    expect(pans.length).toBe(2);
    expect(drag.to).toEqual([]); // no node-drag — empty canvas
    expect(events).toEqual([]);
  });

  it("drags the NODE (not the camera) when a node was hit on down (D3)", () => {
    // Node under the pointer at down-time → node-drag past the threshold; the
    // node's world position is emitted each move, the camera never pans.
    const { events, pans, drag, gestures } = harness(() => "n1");
    gestures.pointerDown({ x: 0, y: 0 });
    gestures.pointerMove({ x: DRAG_THRESHOLD_PX + 2, y: 3 });
    gestures.pointerMove({ x: DRAG_THRESHOLD_PX + 20, y: 9 });
    gestures.pointerUp({ x: DRAG_THRESHOLD_PX + 20, y: 9 });
    expect(pans).toEqual([]); // camera did not pan
    expect(drag.to).toEqual([
      ["n1", DRAG_THRESHOLD_PX + 2, 3],
      ["n1", DRAG_THRESHOLD_PX + 20, 9],
    ]);
    // A drag PAST the threshold ends with moved:true (the assembly RELEASES the
    // node back into the simulation — a free drag, no auto-pin) and no select.
    expect(drag.ends).toEqual([["n1", true]]);
    expect(events).toEqual([]);
  });

  it("a below-threshold node press is STILL a select, never a drag (D3)", () => {
    // Down on a node, up within the threshold → click/select semantics unchanged;
    // nodeDragEnd reports moved:false, so the assembly treats it as a plain press.
    const { events, drag, gestures } = harness((x) => (x < 50 ? "n1" : null));
    gestures.pointerDown({ x: 10, y: 0 });
    gestures.pointerMove({ x: 11, y: 1 }); // within the 4px threshold
    gestures.pointerUp({ x: 11, y: 1 });
    expect(drag.to).toEqual([]); // never crossed the threshold
    expect(drag.ends).toEqual([["n1", false]]); // moved:false → a plain select
    expect(events).toEqual([{ kind: "select", id: "n1" }]);
  });

  it("a drag that STARTS on a node then moves onto empty canvas stays a node-drag (D3)", () => {
    // The branch is fixed at DOWN-TIME: a node hit on down is a node-drag for the
    // whole gesture even as the pointer leaves the node onto empty canvas.
    const { events, pans, drag, gestures } = harness((x) => (x < 5 ? "n1" : null));
    gestures.pointerDown({ x: 0, y: 0 }); // hits n1
    gestures.pointerMove({ x: 40, y: 40 }); // now over empty canvas
    gestures.pointerMove({ x: 80, y: 80 });
    gestures.pointerUp({ x: 80, y: 80 });
    expect(pans).toEqual([]); // never a camera pan
    expect(drag.to).toEqual([
      ["n1", 40, 40],
      ["n1", 80, 80],
    ]);
    expect(drag.ends).toEqual([["n1", true]]);
    expect(events).toEqual([]);
  });

  it("selects on click — hit or clearing miss", () => {
    const { events, gestures } = harness((x) => (x < 50 ? "n1" : null));
    gestures.pointerDown({ x: 10, y: 0 });
    gestures.pointerUp({ x: 11, y: 1 });
    gestures.pointerDown({ x: 90, y: 0 });
    gestures.pointerUp({ x: 90, y: 0 });
    expect(events).toEqual([
      { kind: "select", id: "n1" },
      { kind: "select", id: null },
    ]);
  });

  it("emits a context-menu event with the hit id and client coords (W04.P10)", () => {
    const { events, gestures } = harness((x) => (x < 50 ? "n1" : null));
    gestures.contextMenu({ x: 10, y: 0 }, { x: 110, y: 220 });
    gestures.contextMenu({ x: 90, y: 0 }, { x: 300, y: 40 });
    expect(events).toEqual([
      { kind: "context-menu", id: "n1", target: "node", clientX: 110, clientY: 220 },
      { kind: "context-menu", id: null, target: "node", clientX: 300, clientY: 40 },
    ]);
  });

  it("emits hover only on transitions", () => {
    const { events, gestures } = harness((x) => (x < 50 ? "n1" : null));
    gestures.pointerMove({ x: 10, y: 0 });
    gestures.pointerMove({ x: 20, y: 0 });
    gestures.pointerMove({ x: 90, y: 0 });
    expect(events).toEqual([
      { kind: "hover", id: "n1" },
      { kind: "hover", id: null },
    ]);
    expect(gestures.hoveredId).toBeNull();
  });

  it("opens on double-click over a node only", () => {
    const { events, gestures } = harness((x) => (x < 50 ? "n1" : null));
    gestures.doubleClick({ x: 10, y: 0 });
    gestures.doubleClick({ x: 90, y: 0 });
    expect(events).toEqual([{ kind: "open", id: "n1" }]);
  });
});
