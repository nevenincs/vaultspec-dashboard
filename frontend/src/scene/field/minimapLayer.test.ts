// @vitest-environment happy-dom
//
// Minimap layer verification (graph-quality MEDIUM-3 + W02.P11.S27 recodify).
//
// Colour routing: the minimap previously hardcoded a cold-blue #5b8cf5 for
// feature dots and the viewport rect (a forbidden second accent) and #888 for
// node dots. These tests drive render() through a recording 2D context and
// assert every fill/stroke colour comes from the theme token layer — the
// accent-tone token for feature/viewport, a muted-ink token for nodes, the
// canvas-bg/rule tokens for ground/frame — with no off-palette literal, and
// that the accent re-resolves on a theme flip.
//
// States (minimap surface ADR "States"): the layer always paints its attenuated
// empty ground + frame; with no positions it draws a quiet "nothing to map yet"
// affordance (loading / empty), never blank and never an error. The viewport
// rectangle is the single stroked outline and is clamped to the canvas bounds.
//
// Navigation: click and drag both recover a world coordinate and forward it
// through the navigate callback (the scene applies the camera change).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MinimapLayer } from "./minimapLayer";
import type { NodePosition } from "../positionCache";
import type { SceneNodeData } from "../sceneController";
import type { CameraState } from "./camera";

const TOKENS: Record<string, string> = {
  "--color-canvas-bg": "#fdfaf6",
  "--color-rule": "#ebe6e0",
  "--color-state-active": "#3f774d", // accent-tone (feature + viewport)
  "--color-ink-muted": "#5f5a53", // node dots
};

interface Recording {
  fills: string[];
  strokes: string[];
  texts: string[];
  strokeRects: Array<{ x: number; y: number; w: number; h: number }>;
}

// A 2D context that records every colour assigned and primitive drawn during a
// render pass.
function recordingContext() {
  const rec: Recording = { fills: [], strokes: [], texts: [], strokeRects: [] };
  let fillStyle = "";
  let strokeStyle = "";
  const ctx = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v: string) {
      fillStyle = v;
      rec.fills.push(v);
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(v: string) {
      strokeStyle = v;
      rec.strokes.push(v);
    },
    lineWidth: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    clearRect() {},
    fillRect() {},
    strokeRect(x: number, y: number, w: number, h: number) {
      rec.strokeRects.push({ x, y, w, h });
    },
    beginPath() {},
    arc() {},
    fill() {},
    fillText(text: string) {
      rec.texts.push(text);
    },
  };
  return { ctx, rec };
}

function applyTokens(t: Record<string, string>): void {
  for (const [k, v] of Object.entries(t)) {
    document.documentElement.style.setProperty(k, v);
  }
}

/** A canvas stand-in exposing a recording context and capturing listeners. */
function fakeCanvas(
  ctx: unknown,
  listeners: Record<string, (e: unknown) => void> = {},
) {
  return {
    width: 120,
    height: 120,
    getContext: () => ctx,
    addEventListener: (type: string, cb: (e: unknown) => void) => {
      listeners[type] = cb;
    },
    removeEventListener: (type: string) => {
      delete listeners[type];
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
  } as unknown as HTMLCanvasElement;
}

describe("MinimapLayer colour routing through the token layer (MEDIUM-3)", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    applyTokens(TOKENS);
  });
  afterEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("uses accent-tone for feature/viewport and muted-ink for nodes; no off-palette literal", () => {
    const layer = new MinimapLayer();
    const { ctx, rec } = recordingContext();
    layer.setCanvas(fakeCanvas(ctx));

    const positions = new Map<string, NodePosition>([
      ["feat", { x: 0, y: 0 } as NodePosition],
      ["doc", { x: 10, y: 10 } as NodePosition],
    ]);
    const nodes: SceneNodeData[] = [
      { id: "feat", memberCount: 5 } as SceneNodeData,
      { id: "doc" } as SceneNodeData,
    ];
    layer.updatePositions(positions, nodes);
    layer.updateViewport({ x: 0, y: 0, scale: 1 } as CameraState, 200, 200);

    const all = [...rec.fills, ...rec.strokes];
    // No off-palette cold blue or gray literal survives.
    expect(all).not.toContain("#5b8cf5");
    expect(all).not.toContain("#888");
    // Feature dots + viewport rect use the accent-tone token.
    expect(rec.fills).toContain("#3f774d");
    expect(rec.strokes).toContain("#3f774d");
    // Node dots use the muted-ink token.
    expect(rec.fills).toContain("#5f5a53");
    // Background + frame come from canvas-bg / rule tokens.
    expect(rec.fills).toContain("#fdfaf6");
    expect(rec.strokes).toContain("#ebe6e0");

    // Every drawn colour is one of the four palette tokens — no literal escapes.
    const palette = new Set(Object.values(TOKENS));
    for (const c of all) {
      expect(palette.has(c)).toBe(true);
    }

    layer.destroy();
  });

  it("re-resolves the accent token on a theme flip", () => {
    const layer = new MinimapLayer();
    const { ctx, rec } = recordingContext();
    layer.setCanvas(fakeCanvas(ctx));

    // Flip to the dark accent-tone hex; the next render must pick it up.
    document.documentElement.style.setProperty("--color-state-active", "#5d9d6b");
    layer.updatePositions(new Map([["feat", { x: 0, y: 0 } as NodePosition]]), [
      { id: "feat", memberCount: 3 } as SceneNodeData,
    ]);

    expect(rec.fills).toContain("#5d9d6b");
    // The old accent is not painted after the flip.
    expect(rec.fills).not.toContain("#3f774d");
    layer.destroy();
  });
});

describe("MinimapLayer states (ADR: loading / empty / viewport bounds)", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    applyTokens(TOKENS);
  });
  afterEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("paints the attenuated empty ground + frame + 'nothing to map yet' with no field", () => {
    const layer = new MinimapLayer();
    const { ctx, rec } = recordingContext();
    layer.setCanvas(fakeCanvas(ctx));
    // setCanvas triggers a render with zero positions (the loading/empty state).

    // Ground + frame are painted from the token layer even with no nodes.
    expect(rec.fills).toContain("#fdfaf6"); // canvas-bg ground
    expect(rec.strokes).toContain("#ebe6e0"); // rule frame
    // The quiet empty affordance is drawn, not an error and not a spinner.
    expect(rec.texts).toContain("nothing to map yet");
    // No accent is spent when there is nothing to overview.
    expect(rec.fills).not.toContain("#3f774d");
    layer.destroy();
  });

  it("clamps the viewport rectangle into the canvas bounds when off-screen", () => {
    const layer = new MinimapLayer();
    const { ctx, rec } = recordingContext();
    layer.setCanvas(fakeCanvas(ctx));

    layer.updatePositions(
      new Map<string, NodePosition>([
        ["a", { x: 0, y: 0 } as NodePosition],
        ["b", { x: 10, y: 10 } as NodePosition],
      ]),
      [{ id: "a" } as SceneNodeData, { id: "b" } as SceneNodeData],
    );
    // A camera whose visible world rect is far outside the node bounds — the
    // unclamped rect would stroke well off-canvas; clamping pins it to [0,120].
    layer.updateViewport({ x: -10000, y: -10000, scale: 1 } as CameraState, 200, 200);

    // The viewport stroke rect (the second strokeRect after node draws; the
    // first is none, the frame is last) stays inside the canvas.
    for (const r of rec.strokeRects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(120);
      expect(r.y + r.h).toBeLessThanOrEqual(120);
    }
    layer.destroy();
  });

  it("renders the viewport rect as the single stroked accent outline", () => {
    const layer = new MinimapLayer();
    const { ctx, rec } = recordingContext();
    layer.setCanvas(fakeCanvas(ctx));
    layer.updatePositions(
      new Map<string, NodePosition>([
        ["a", { x: 0, y: 0 } as NodePosition],
        ["b", { x: 4, y: 4 } as NodePosition],
      ]),
      [{ id: "a" } as SceneNodeData, { id: "b" } as SceneNodeData],
    );
    layer.updateViewport({ x: 0, y: 0, scale: 1 } as CameraState, 50, 50);
    // Two stroke ops only: the viewport rect (accent) and the frame (rule).
    // Node dots are filled, not stroked — so position is carried by an outline,
    // legible in grayscale.
    expect(rec.strokes).toContain("#3f774d"); // accent viewport
    expect(rec.strokes).toContain("#ebe6e0"); // rule frame
    expect(rec.strokes.filter((s) => s === "#3f774d")).toHaveLength(1);
    layer.destroy();
  });
});

describe("MinimapLayer navigation (click + drag → navigate callback)", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    applyTokens(TOKENS);
  });
  afterEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("forwards a clicked world coordinate to the navigate callback", () => {
    const layer = new MinimapLayer();
    const navigate = vi.fn();
    layer.setNavigateCallback(navigate);
    const { ctx } = recordingContext();
    const listeners: Record<string, (e: unknown) => void> = {};
    const canvas = fakeCanvas(ctx, listeners);
    layer.setCanvas(canvas);

    layer.updatePositions(
      new Map<string, NodePosition>([
        ["a", { x: 0, y: 0 } as NodePosition],
        ["b", { x: 100, y: 100 } as NodePosition],
      ]),
      [{ id: "a" } as SceneNodeData, { id: "b" } as SceneNodeData],
    );

    // Click at the canvas centre → a world coordinate near the field centre.
    listeners["click"]({ clientX: 60, clientY: 60 });
    expect(navigate).toHaveBeenCalledOnce();
    const [wx, wy] = navigate.mock.calls[0];
    expect(wx).toBeGreaterThan(0);
    expect(wy).toBeGreaterThan(0);
    expect(wx).toBeLessThan(100);
    expect(wy).toBeLessThan(100);
    layer.destroy();
  });

  it("scrubs the field on pointer drag, forwarding each move to the callback", () => {
    const layer = new MinimapLayer();
    const navigate = vi.fn();
    layer.setNavigateCallback(navigate);
    const { ctx } = recordingContext();
    const listeners: Record<string, (e: unknown) => void> = {};
    const canvas = fakeCanvas(ctx, listeners);
    layer.setCanvas(canvas);

    layer.updatePositions(
      new Map<string, NodePosition>([
        ["a", { x: 0, y: 0 } as NodePosition],
        ["b", { x: 100, y: 100 } as NodePosition],
      ]),
      [{ id: "a" } as SceneNodeData, { id: "b" } as SceneNodeData],
    );

    listeners["pointerdown"]({ clientX: 30, clientY: 30, pointerId: 1 });
    listeners["pointermove"]({ clientX: 50, clientY: 50, pointerId: 1 });
    listeners["pointermove"]({ clientX: 70, clientY: 70, pointerId: 1 });
    listeners["pointerup"]({ clientX: 70, clientY: 70, pointerId: 1 });

    // down + two moves = three navigate calls; the coordinates advance.
    expect(navigate.mock.calls.length).toBe(3);
    const xs = navigate.mock.calls.map((c) => c[0]);
    expect(xs[1]).toBeGreaterThan(xs[0]);
    expect(xs[2]).toBeGreaterThan(xs[1]);

    // After pointerup a stray move does not navigate (drag ended).
    navigate.mockClear();
    listeners["pointermove"]({ clientX: 90, clientY: 90, pointerId: 1 });
    expect(navigate).not.toHaveBeenCalled();
    layer.destroy();
  });

  it("does not navigate after destroy (listeners detached)", () => {
    const layer = new MinimapLayer();
    const navigate = vi.fn();
    layer.setNavigateCallback(navigate);
    const { ctx } = recordingContext();
    const listeners: Record<string, (e: unknown) => void> = {};
    const canvas = fakeCanvas(ctx, listeners);
    layer.setCanvas(canvas);
    layer.destroy();
    // The click listener has been removed from the canvas.
    expect(listeners["click"]).toBeUndefined();
  });
});
