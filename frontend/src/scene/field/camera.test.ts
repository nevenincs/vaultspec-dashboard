import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SceneEvent } from "../sceneController";
import type { Container } from "pixi.js";

import {
  Camera,
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

// ---------------------------------------------------------------------------
// Camera class — animateTo + gesture-cancellation invariants (FP3-01)
// ---------------------------------------------------------------------------

/**
 * Minimal Container stub: Camera.apply() only calls position.set and
 * scale.set; no WebGL context needed.
 */
function fakeWorld(): Container {
  return {
    position: { set: () => {} },
    scale: { set: () => {} },
  } as unknown as Container;
}

/**
 * RAF mock: single-slot pending frame. cancelAnimationFrame clears it so
 * Camera.cancelAnimation() reliably prevents further step calls.
 */
function rafHarness() {
  let pending: (() => void) | null = null;
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
    pending = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    pending = null;
  });
  /** Advance the animation until it self-terminates or the limit is hit. */
  function flush(limit = 500) {
    let i = 0;
    while (pending !== null && i++ < limit) {
      const cb = pending;
      pending = null;
      cb();
    }
  }
  /** True when no frame is pending (animation stopped or not started). */
  function idle() {
    return pending === null;
  }
  /** Fire exactly one frame and stop. */
  function tick() {
    if (pending) {
      const cb = pending;
      pending = null;
      cb();
    }
  }
  return { flush, idle, tick };
}

describe("Camera.animateTo", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("snaps to the exact target on completion — no overshoot", () => {
    const { flush } = rafHarness();
    const cam = new Camera(fakeWorld());
    cam.set({ x: 200, y: 100, scale: 3 });
    cam.animateTo({ x: 0, y: 0, scale: 1 });
    flush();
    expect(cam.current).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("fires onDone exactly once on completion", () => {
    const { flush } = rafHarness();
    const cam = new Camera(fakeWorld());
    let calls = 0;
    cam.animateTo({ x: 0, y: 0, scale: 1 }, () => {
      calls++;
    });
    flush();
    expect(calls).toBe(1);
  });

  it("schedules no further frames after onDone fires", () => {
    const { flush, idle } = rafHarness();
    const cam = new Camera(fakeWorld());
    cam.animateTo({ x: 0, y: 0, scale: 1 });
    flush();
    expect(idle()).toBe(true);
  });

  it("panBy cancels an in-progress animation — gesture wins over programmatic pan", () => {
    const { idle, tick } = rafHarness();
    const cam = new Camera(fakeWorld());
    cam.set({ x: 0, y: 0, scale: 1 });
    let done = false;
    cam.animateTo({ x: 1000, y: 0, scale: 1 }, () => {
      done = true;
    });
    expect(idle()).toBe(false); // animation scheduled
    tick(); // advance one frame — camera moves toward target
    const midX = cam.current.x;
    cam.panBy(5, 0); // gesture interrupts
    expect(idle()).toBe(true); // RAF cancelled
    expect(done).toBe(false);
    // Camera reflects the pan delta from the post-frame position
    expect(cam.current.x).toBeCloseTo(midX + 5, 1);
  });

  it("set cancels an in-progress animation and applies the new state immediately", () => {
    const { idle } = rafHarness();
    const cam = new Camera(fakeWorld());
    cam.animateTo({ x: 1000, y: 0, scale: 2 });
    expect(idle()).toBe(false);
    cam.set({ x: 42, y: 99, scale: 1 });
    expect(idle()).toBe(true);
    expect(cam.current).toMatchObject({ x: 42, y: 99, scale: 1 });
  });

  it("zoomAt cancels an in-progress animation", () => {
    const { idle } = rafHarness();
    const cam = new Camera(fakeWorld());
    cam.animateTo({ x: 500, y: 0, scale: 3 });
    expect(idle()).toBe(false);
    cam.zoomAt(0, 0, 1.5);
    expect(idle()).toBe(true);
  });

  it("a second animateTo cancels the first", () => {
    const { tick, idle } = rafHarness();
    const cam = new Camera(fakeWorld());
    let first = false;
    cam.animateTo({ x: 1000, y: 0, scale: 1 }, () => {
      first = true;
    });
    tick();
    cam.animateTo({ x: 0, y: 0, scale: 1 }); // cancels first
    expect(first).toBe(false);
    expect(idle()).toBe(false); // second animation scheduled
  });
});

// ---------------------------------------------------------------------------
// Base motion law: instant focus + prefers-reduced-motion snap (HIGH-2)
// ---------------------------------------------------------------------------

describe("Camera.animateTo instant / reduced-motion snap (base motion law)", () => {
  it("snaps to the target this frame and fires onDone when opts.instant is set", () => {
    const { idle } = rafHarness();
    // reducedMotion=false so ONLY the instant flag drives the snap.
    const cam = new Camera(fakeWorld(), () => false);
    cam.set({ x: 200, y: 100, scale: 3 });
    let done = false;
    cam.animateTo(
      { x: 0, y: 0, scale: 1 },
      () => {
        done = true;
      },
      { instant: true },
    );
    // No RAF scheduled — the camera is already at the exact target.
    expect(idle()).toBe(true);
    expect(cam.current).toEqual({ x: 0, y: 0, scale: 1 });
    expect(done).toBe(true);
  });

  it("snaps instantly under prefers-reduced-motion even when animate is requested", () => {
    const { idle } = rafHarness();
    // reducedMotion=true, NO instant flag — the reduced-motion floor still snaps,
    // closing the cross-region focus violation (search-hit / event / browser-row).
    const cam = new Camera(fakeWorld(), () => true);
    cam.set({ x: 500, y: 500, scale: 4 });
    cam.animateTo({ x: 10, y: 20, scale: 1 });
    expect(idle()).toBe(true);
    expect(cam.current).toEqual({ x: 10, y: 20, scale: 1 });
  });

  it("still animates over RAF when motion is allowed and no instant flag is set", () => {
    const { idle, flush } = rafHarness();
    const cam = new Camera(fakeWorld(), () => false);
    cam.animateTo({ x: 1000, y: 0, scale: 1 });
    // A frame IS scheduled — the default animated path is unchanged.
    expect(idle()).toBe(false);
    flush();
    expect(cam.current).toEqual({ x: 1000, y: 0, scale: 1 });
  });
});
