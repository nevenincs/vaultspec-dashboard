// S06 adversarial — idempotent scene mount bindings.
//
// Reproduce-then-fix cadence: each case is written so that removing the
// assemblyMounted guard from DashboardField.mount() causes the test to fail.
//
// In the node test environment PixiField.mount() is a no-op (no DOM / WebGL),
// so the synchronous part of DashboardField.mount() — registering the onReady
// cleanup in detachListeners — runs without side-effects and is fully observable.

import { describe, expect, it, vi } from "vitest";

import { DashboardField } from "./fieldAssembly";
import { INCREMENTAL_REHEAT_ALPHA } from "./forceLayout";
import type { NodePosition } from "../positionCache";
import type { SceneEdgeData, SceneNodeData } from "../sceneController";

/** Cast to reach the private detachListeners array (read-only inspection). */
function detachCount(field: DashboardField): number {
  return (field as unknown as { detachListeners: (() => void)[] }).detachListeners
    .length;
}

/** Reach the private movement gate + its prior-frame state (D4). */
interface GateInternals {
  lastFrame: ReadonlyMap<string, NodePosition> | null;
  frameMoved(positions: ReadonlyMap<string, NodePosition>): boolean;
}
function gate(field: DashboardField): GateInternals {
  return field as unknown as GateInternals;
}
const frame = (entries: [string, NodePosition][]) =>
  new Map<string, NodePosition>(entries);

describe("DashboardField.mount — S06 adversarial (idempotent assembly)", () => {
  it("first mount() registers exactly one cleanup entry in detachListeners", () => {
    const field = new DashboardField();
    field.mount({} as HTMLElement);
    expect(detachCount(field)).toBe(1);
    field.destroy();
  });

  it("second mount() call is a no-op: detachListeners count does not grow", () => {
    // Without the assemblyMounted guard, a second mount() would push another
    // offReady entry and later register duplicate canvas / ticker / theme
    // listeners inside the onReady callback.
    const field = new DashboardField();
    field.mount({} as HTMLElement);
    const after1 = detachCount(field);
    field.mount({} as HTMLElement); // should be swallowed by the guard
    expect(detachCount(field)).toBe(after1);
    field.destroy();
  });

  it("triple-mount does not accumulate extra listeners (adversarial: rapid remount storm)", () => {
    const field = new DashboardField();
    field.mount({} as HTMLElement);
    const after1 = detachCount(field);
    field.mount({} as HTMLElement);
    field.mount({} as HTMLElement);
    expect(detachCount(field)).toBe(after1);
    field.destroy();
  });

  it("destroy() resets the guard so a subsequent mount() succeeds", () => {
    const field = new DashboardField();
    field.mount({} as HTMLElement);
    field.destroy();
    // After destroy the guard must reset; a fresh mount() must register again.
    expect(detachCount(field)).toBe(0); // destroy cleared everything
    field.mount({} as HTMLElement);
    expect(detachCount(field)).toBeGreaterThan(0);
    field.destroy();
  });

  it("destroy() then double-mount obeys the guard on the re-mounted instance", () => {
    const field = new DashboardField();
    field.mount({} as HTMLElement);
    field.destroy();
    field.mount({} as HTMLElement);
    const after1 = detachCount(field);
    field.mount({} as HTMLElement); // guard must block
    expect(detachCount(field)).toBe(after1);
    field.destroy();
  });
});

describe("DashboardField movement gate (D4: per-frame work ceases when still)", () => {
  it("renders the first frame (no prior frame to compare)", () => {
    const g = gate(new DashboardField());
    g.lastFrame = null;
    expect(g.frameMoved(frame([["a", { x: 0, y: 0 }]]))).toBe(true);
  });

  it("skips a frame where every node stayed within the epsilon", () => {
    const g = gate(new DashboardField());
    g.lastFrame = frame([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 10, y: 10 }],
    ]);
    // Sub-epsilon jitter (< 0.4) is imperceptible — no re-render.
    expect(
      g.frameMoved(
        frame([
          ["a", { x: 0.1, y: 0.1 }],
          ["b", { x: 10.2, y: 9.9 }],
        ]),
      ),
    ).toBe(false);
  });

  it("renders when a node moves beyond the epsilon", () => {
    const g = gate(new DashboardField());
    g.lastFrame = frame([["a", { x: 0, y: 0 }]]);
    expect(g.frameMoved(frame([["a", { x: 5, y: 0 }]]))).toBe(true);
  });

  it("renders when the node set changes size (a re-seed)", () => {
    const g = gate(new DashboardField());
    g.lastFrame = frame([["a", { x: 0, y: 0 }]]);
    expect(
      g.frameMoved(
        frame([
          ["a", { x: 0, y: 0 }],
          ["b", { x: 1, y: 1 }],
        ]),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// graph-force-stability W01.P04.S17 — incremental-reheat routing,
// double-init/double-fit collapse, and the per-node collision callback.
//
// PixiField.mount() is a no-op in node, so this.layout/sprites/edges are never
// assembled by mount(). These tests inject minimal recording stubs for the
// live-after-mount parts so the routing logic (which method gets called) is
// observable without a GPU. The constants are re-confirmed against the lowered
// INCREMENTAL_REHEAT_ALPHA the live-loop driver tests tuned (S15).
// ---------------------------------------------------------------------------

interface FakeLayout {
  init: ReturnType<typeof vi.fn>;
  applyChanges: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  settleOffline: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  beginInteraction: ReturnType<typeof vi.fn>;
  endInteraction: ReturnType<typeof vi.fn>;
  positions: ReadonlyMap<string, NodePosition>;
}

function fakeLayout(): FakeLayout {
  return {
    init: vi.fn(),
    applyChanges: vi.fn(),
    start: vi.fn(),
    settleOffline: vi.fn(),
    stop: vi.fn(),
    beginInteraction: vi.fn(),
    endInteraction: vi.fn(),
    positions: new Map<string, NodePosition>(),
  };
}

/** Inject the live-after-mount stubs so the routing logic runs without a GPU. */
function withFakeLayout(field: DashboardField): FakeLayout {
  const layout = fakeLayout();
  const f = field as unknown as {
    layout: FakeLayout;
    sprites: { sync: () => void; setLod: () => void };
    edges: {
      setEdges: () => { rejected: unknown[] };
      setArrowVisibility: () => void;
      setRoutes: () => void;
    };
  };
  f.layout = layout;
  f.sprites = { sync: vi.fn(), setLod: vi.fn() };
  f.edges = {
    setEdges: vi.fn(() => ({ rejected: [] })),
    setArrowVisibility: vi.fn(),
    setRoutes: vi.fn(),
  };
  return layout;
}

const n = (id: string, salience?: number): SceneNodeData => ({
  id,
  kind: "doc",
  ...(salience !== undefined ? { salience } : {}),
});
const e = (id: string, src: string, dst: string): SceneEdgeData => ({
  id,
  src,
  dst,
  relation: "links",
  tier: "structural",
  confidence: 1,
});

describe("DashboardField incremental-reheat routing (D1)", () => {
  it("first set-data full-inits (no prior laid-out set)", () => {
    const field = new DashboardField();
    const layout = withFakeLayout(field);
    field.command({
      kind: "set-data",
      nodes: [n("a"), n("b")],
      edges: [e("e1", "a", "b")],
    });
    expect(layout.init).toHaveBeenCalledTimes(1);
    expect(layout.applyChanges).not.toHaveBeenCalled();
  });

  it("a content delta over a surviving set routes through applyChanges, not re-init", () => {
    const field = new DashboardField();
    const layout = withFakeLayout(field);
    // First load lays out {a,b}.
    field.command({
      kind: "set-data",
      nodes: [n("a"), n("b")],
      edges: [e("e1", "a", "b")],
    });
    layout.init.mockClear();
    // A live keyframe adds c around the surviving {a,b}.
    field.command({
      kind: "set-data",
      nodes: [n("a"), n("b"), n("c")],
      edges: [e("e1", "a", "b"), e("e2", "b", "c")],
    });
    expect(layout.init).not.toHaveBeenCalled();
    expect(layout.applyChanges).toHaveBeenCalledTimes(1);
    const change = layout.applyChanges.mock.calls[0][0];
    expect(change.addNodeIds).toEqual(["c"]);
    expect(change.removeNodeIds).toEqual([]);
    // The radiusOf callback is passed (D4): the third arg is a function.
    expect(typeof layout.applyChanges.mock.calls[0][2]).toBe("function");
  });

  it("a fully-disjoint set (no survivors) re-inits, not a reheat", () => {
    const field = new DashboardField();
    const layout = withFakeLayout(field);
    field.command({ kind: "set-data", nodes: [n("a"), n("b")], edges: [] });
    layout.init.mockClear();
    field.command({ kind: "set-data", nodes: [n("x"), n("y")], edges: [] });
    expect(layout.applyChanges).not.toHaveBeenCalled();
    expect(layout.init).toHaveBeenCalledTimes(1);
  });

  it("a scope swap re-inits even with a surviving id set (new mental map)", () => {
    const field = new DashboardField();
    const layout = withFakeLayout(field);
    field.command({ kind: "set-data", nodes: [n("a"), n("b")], edges: [] });
    layout.init.mockClear();
    // Same ids but a different persistence scope = a workspace swap → re-init.
    field.setPersistenceScope("default", "other-scope");
    field.command({
      kind: "set-data",
      nodes: [n("a"), n("b"), n("c")],
      edges: [],
    });
    expect(layout.applyChanges).not.toHaveBeenCalled();
    expect(layout.init).toHaveBeenCalledTimes(1);
  });
});

describe("DashboardField double-init collapse (D6)", () => {
  it("set-representation-mode connectivity is a no-op once set-data laid it out", () => {
    const field = new DashboardField();
    const layout = withFakeLayout(field);
    // set-data is the single connectivity initializer on first load.
    field.command({ kind: "set-data", nodes: [n("a"), n("b")], edges: [] });
    layout.init.mockClear();
    layout.start.mockClear();
    // The mount-time set-representation-mode:connectivity must NOT re-init.
    field.command({ kind: "set-representation-mode", mode: "connectivity" });
    expect(layout.init).not.toHaveBeenCalled();
    expect(layout.start).not.toHaveBeenCalled();
  });
});

describe("INCREMENTAL_REHEAT_ALPHA (S17 re-baseline)", () => {
  it("is the lowered reheat the live-loop driver tuned, below the old warm 0.5", () => {
    expect(INCREMENTAL_REHEAT_ALPHA).toBeLessThan(0.5);
    expect(INCREMENTAL_REHEAT_ALPHA).toBeCloseTo(0.15, 5);
  });
});
