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
} from "./camera";

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
  function harness(hit: (x: number, y: number) => string | null) {
    const events: SceneEvent[] = [];
    const pans: [number, number][] = [];
    const gestures = new PointerGestures({
      emit: (e) => events.push(e),
      panBy: (dx, dy) => pans.push([dx, dy]),
      hitTestScreen: hit,
    });
    return { events, pans, gestures };
  }

  it("pans on drag and suppresses the click", () => {
    const { events, pans, gestures } = harness(() => "n1");
    gestures.pointerDown({ x: 0, y: 0 });
    gestures.pointerMove({ x: DRAG_THRESHOLD_PX + 2, y: 0 });
    gestures.pointerMove({ x: DRAG_THRESHOLD_PX + 10, y: 5 });
    gestures.pointerUp({ x: DRAG_THRESHOLD_PX + 10, y: 5 });
    expect(pans.length).toBe(2);
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
