// Unit tests for MinimapWidget's scene-seam contract (binding headerless minimap).
//
// The widget provides a canvas target to SceneController; the scene owns rendering
// inside it. The binding redesign retired the collapse control, so the contract is
// now simply: register the canvas on mount, unregister it on unmount. We model the
// effect as a pure function and assert the call sequence for each lifecycle.

import { describe, expect, it, vi } from "vitest";

interface FakeController {
  setMinimapCanvas: (canvas: HTMLCanvasElement | null) => void;
}

// Mirrors MinimapWidget.useEffect: register on mount, unregister on unmount.
function runEffect(
  controller: FakeController,
  canvas: HTMLCanvasElement | null,
): () => void {
  controller.setMinimapCanvas(canvas);
  return () => {
    controller.setMinimapCanvas(null);
  };
}

function makeCanvas(): HTMLCanvasElement {
  return {} as HTMLCanvasElement;
}

describe("MinimapWidget seam contract (setMinimapCanvas)", () => {
  it("registers the canvas on mount", () => {
    const ctrl = { setMinimapCanvas: vi.fn() };
    const canvas = makeCanvas();

    runEffect(ctrl, canvas);

    expect(ctrl.setMinimapCanvas).toHaveBeenCalledOnce();
    expect(ctrl.setMinimapCanvas).toHaveBeenCalledWith(canvas);
  });

  it("unregisters the canvas on unmount (cleanup)", () => {
    const ctrl = { setMinimapCanvas: vi.fn() };
    const canvas = makeCanvas();

    const cleanup = runEffect(ctrl, canvas);
    ctrl.setMinimapCanvas.mockClear();
    cleanup();

    expect(ctrl.setMinimapCanvas).toHaveBeenCalledOnce();
    expect(ctrl.setMinimapCanvas).toHaveBeenCalledWith(null);
  });

  it("full lifecycle: mount then unmount accumulates [canvas, null]", () => {
    const calls: Array<HTMLCanvasElement | null> = [];
    const ctrl = { setMinimapCanvas: (c: HTMLCanvasElement | null) => calls.push(c) };
    const canvas = makeCanvas();

    const cleanup = runEffect(ctrl, canvas);
    cleanup();

    expect(calls).toEqual([canvas, null]);
  });
});
