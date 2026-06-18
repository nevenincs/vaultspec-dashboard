// @vitest-environment happy-dom
//
// The portal-pinned canvas bridge (editor-dock-workspace P02.S06). Verifies the
// load-bearing mechanism that lets the graph survive docking: the canvas host is
// positioned to TRACK the graph panel's rect (so docking moves only the rect, not
// the canvas DOM node — the WebGL context and SceneController are never torn down
// because the canvas is never re-parented). These tests exercise the rect
// publish/subscribe model and the relative-rect math directly; the architectural
// invariant (the canvas is mounted ONCE in GraphCanvasHost, a sibling of the
// dockview container, never inside a panel) is enforced structurally by
// GraphCanvasHost + DockWorkspace.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getGraphPin,
  setGraphVisible,
  setWorkspaceContainer,
  subscribeGraphPin,
  trackGraphRect,
} from "./canvasPin";

/** A stub element whose client rect is fixed for the test. */
function elementWithRect(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
  return el;
}

beforeEach(() => {
  // happy-dom lacks ResizeObserver and rAF; stub them so the settle loop does not
  // spin in the test (we assert the synchronously-primed rect, not the loop).
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  // Reset the shared pin state between tests.
  setGraphVisible(false);
  setWorkspaceContainer(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("graph pin visibility", () => {
  it("toggles visibility and clears the rect when hidden", () => {
    setGraphVisible(true);
    expect(getGraphPin().visible).toBe(true);
    setGraphVisible(false);
    expect(getGraphPin().visible).toBe(false);
    expect(getGraphPin().rect).toBeNull();
  });

  it("publishes a NEW snapshot reference on change (for useSyncExternalStore)", () => {
    const before = getGraphPin();
    setGraphVisible(true);
    const after = getGraphPin();
    expect(after).not.toBe(before);
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGraphPin(listener);
    setGraphVisible(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setGraphVisible(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("rect tracking (relative to the workspace container)", () => {
  it("publishes the panel rect relative to the workspace container's top-left", () => {
    const container = elementWithRect({
      left: 20,
      top: 10,
      width: 1200,
      height: 800,
    });
    const placeholder = elementWithRect({
      left: 100,
      top: 50,
      width: 800,
      height: 600,
    });
    setWorkspaceContainer(container);

    const stop = trackGraphRect(placeholder);
    // The rect is primed synchronously: panel viewport rect minus container origin.
    expect(getGraphPin().rect).toEqual({
      left: 80, // 100 - 20
      top: 40, //  50 - 10
      width: 800,
      height: 600,
    });
    stop();
  });

  it("follows the panel to a NEW rect (a dock/move) without re-priming identity", () => {
    const container = elementWithRect({ left: 0, top: 0, width: 1000, height: 800 });
    const movable = elementWithRect({ left: 0, top: 0, width: 500, height: 800 });
    setWorkspaceContainer(container);
    const stop = trackGraphRect(movable);
    expect(getGraphPin().rect).toEqual({ left: 0, top: 0, width: 500, height: 800 });

    // Simulate dockview moving the graph panel to the right half (a hot-dock): the
    // placeholder rect changes; re-tracking republishes the new rect. The canvas
    // host follows the rect — the canvas DOM node itself is never touched.
    stop();
    const moved = elementWithRect({ left: 500, top: 0, width: 500, height: 800 });
    const stop2 = trackGraphRect(moved);
    expect(getGraphPin().rect).toEqual({ left: 500, top: 0, width: 500, height: 800 });
    stop2();
  });
});
