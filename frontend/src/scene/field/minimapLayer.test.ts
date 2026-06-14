// @vitest-environment happy-dom
//
// Minimap colour-routing verification (MEDIUM-3). The minimap previously
// hardcoded a cold-blue #5b8cf5 for feature dots and the viewport rect (a
// forbidden second accent) and #888 for node dots. This test drives render()
// through a recording 2D context and asserts every fill/stroke colour comes
// from the theme token layer - the accent-tone token for feature/viewport and
// a muted-ink token for nodes - with no off-palette literal.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

// A 2D context that records every colour assigned during a render pass.
function recordingContext() {
  const fills: string[] = [];
  const strokes: string[] = [];
  let fillStyle = "";
  let strokeStyle = "";
  const ctx = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v: string) {
      fillStyle = v;
      fills.push(v);
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(v: string) {
      strokeStyle = v;
      strokes.push(v);
    },
    lineWidth: 1,
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    arc() {},
    fill() {},
  };
  return { ctx, fills, strokes };
}

function applyTokens(t: Record<string, string>): void {
  for (const [k, v] of Object.entries(t)) {
    document.documentElement.style.setProperty(k, v);
  }
}

describe("MinimapLayer routes colours through the token layer (MEDIUM-3)", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    applyTokens(TOKENS);
  });
  afterEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("uses accent-tone for feature/viewport and muted-ink for nodes; no cold blue", () => {
    const layer = new MinimapLayer();
    const { ctx, fills, strokes } = recordingContext();

    // Wire a fake canvas exposing the recording context.
    const canvas = {
      width: 120,
      height: 120,
      getContext: () => ctx,
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLCanvasElement;
    layer.setCanvas(canvas);

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

    const all = [...fills, ...strokes];
    // No off-palette cold blue or gray literal survives.
    expect(all).not.toContain("#5b8cf5");
    expect(all).not.toContain("#888");
    // Feature dots + viewport rect use the accent-tone token.
    expect(fills).toContain("#3f774d");
    expect(strokes).toContain("#3f774d");
    // Node dots use the muted-ink token.
    expect(fills).toContain("#5f5a53");
    // Background + border come from canvas-bg / rule tokens.
    expect(fills).toContain("#fdfaf6");
    expect(strokes).toContain("#ebe6e0");

    layer.destroy();
  });

  it("re-resolves the accent token on a theme flip", () => {
    const layer = new MinimapLayer();
    const { ctx, fills } = recordingContext();
    const canvas = {
      width: 120,
      height: 120,
      getContext: () => ctx,
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLCanvasElement;
    layer.setCanvas(canvas);

    // Flip to the dark accent-tone hex; the next render must pick it up.
    document.documentElement.style.setProperty("--color-state-active", "#5d9d6b");
    layer.updatePositions(new Map([["feat", { x: 0, y: 0 } as NodePosition]]), [
      { id: "feat", memberCount: 3 } as SceneNodeData,
    ]);

    expect(fills).toContain("#5d9d6b");
    layer.destroy();
  });
});
