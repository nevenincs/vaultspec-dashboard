// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { SceneController, type SceneEvent } from "../sceneController";
import { nodeWorldRadius } from "./appearance";
import { D3ForceSolver, D3_FORCE_DEFAULTS, type SolverEdge } from "./d3ForceSolver";
import { ThreeField } from "./threeField";

/** Expose the real field's CPU and interaction lifecycle without mounting WebGL. */
class CpuField extends ThreeField {
  readonly events: SceneEvent[] = [];
  readonly element = document.createElement("div");

  constructor() {
    super();
    this.controller = new SceneController(this);
    this.controller.on((event) => this.events.push(event));
    this.appearance.nodeIcons = false;
    this.attachInteraction(this.element);
  }

  load(ids = ["a", "b"], settled = true, edges: SolverEdge[] = []): void {
    this.disposeGraph();
    this.nodes = ids.map((id) => ({ id, kind: "document" }));
    this.idToIndex = new Map(ids.map((id, i) => [id, i]));
    this.solver = new D3ForceSolver(
      ids.length,
      edges,
      this.nodes.map((node) => nodeWorldRadius(node, this.appearance)),
      this.params,
    );
    this.solver.seed((i) => ({ x: i * 80, y: 0 }));
    this.solver.prewarmReflow(() => !settled, 0.3, 0);
    this.simPositions = new Float32Array(this.solver.texSize ** 2 * 4);
    this.solver.pack(this.simPositions);
    this.cpuPositions = this.simPositions.slice();
    this.buildNodes(this.nodes, this.solver.texSize);
    this.resize(600, 600);
    this.setRunning(!settled);
  }

  removeGraph(): void {
    this.disposeGraph();
    this.requestRender();
  }

  advance(now: number): void {
    cancelAnimationFrame(this.raf);
    this.frame(now);
    cancelAnimationFrame(this.raf);
  }

  get snapshot() {
    return {
      running: this.running,
      alpha: this.solver?.alpha(),
      active: this.solver?.activeCount,
      settled: this.solver?.isSettled(),
      positions: this.nodes.map((_, i) => this.solver?.position(i)),
    };
  }

  get hasGesture(): boolean {
    return (
      this.pointerGesture !== null || this.dragActive || this.pendingDragIndex >= 0
    );
  }

  get displayedPositions() {
    return this.nodes.map((_, i) => ({
      x: this.cpuPositions[i * 4],
      y: this.cpuPositions[i * 4 + 1],
    }));
  }

  get hasScheduledFrame(): boolean {
    return this.scheduled;
  }

  get hasPendingPaint(): boolean {
    return this.needsRender;
  }

  pointer(kind: string, x: number, y: number, pointerId = 1): void {
    this.element.dispatchEvent(
      new PointerEvent(kind, { pointerId, button: 0, clientX: x, clientY: y }),
    );
  }
}

const fields: CpuField[] = [];
function field(settled = true): CpuField {
  const value = new CpuField();
  fields.push(value);
  value.load(["a", "b"], settled);
  value.events.length = 0;
  return value;
}

afterEach(() => {
  for (const value of fields) value.destroy();
  fields.length = 0;
});

describe("ThreeField energy and gesture lifecycle", () => {
  it("selects an off-center click with tiny pointer movement without waking or moving nodes", () => {
    const value = field();
    const before = value.snapshot;
    value.pointer("pointerdown", 307, 300);
    expect(value.snapshot).toEqual(before);
    value.pointer("pointermove", 308, 301);
    value.pointer("pointerup", 308, 301);
    expect(value.snapshot).toEqual(before);
    expect(value.events).toContainEqual({ kind: "select", id: "a" });
    expect(value.events.some((event) => event.kind === "sim-state")).toBe(false);
  });

  it("starts a genuine drag at its grabbed offset and selects the dragged identity", () => {
    const value = field();
    value.pointer("pointerdown", 307, 300);
    value.pointer("pointermove", 317, 300);
    expect(value.snapshot.running).toBe(true);
    value.advance(0);
    value.advance(17);
    expect(value.snapshot.positions[0]?.x).toBeCloseTo(10);
    expect(value.snapshot.positions[1]).toEqual({ x: 80, y: 0 });
    // Selection must use the grabbed identity even before the next display update.
    value.pointer("pointermove", 350, 300);
    const alphaBeforeRelease = value.snapshot.alpha;
    value.pointer("pointerup", 350, 300);
    expect(value.snapshot.positions[0]?.x).toBeCloseTo(43);
    expect(value.displayedPositions[0]).toEqual({ x: 43, y: 0 });
    expect(value.snapshot.alpha).toBe(alphaBeforeRelease);
    expect(value.events).toContainEqual({ kind: "select", id: "a" });
    expect(value.hasGesture).toBe(false);
  });

  it("commits a sub-tick drag at its release endpoint and wakes only nearby stretched links", () => {
    const value = field();
    value.load(["a", "b", "c"], true, [{ source: 0, target: 1 }]);
    value.pointer("pointerdown", 307, 300);
    value.pointer("pointermove", 340, 300);
    const alphaBeforeRelease = value.snapshot.alpha;
    // No frame or solver tick, and pointerup advances beyond the last movement.
    value.pointer("pointerup", 350, 300);
    expect(value.snapshot.positions[0]?.x).toBeCloseTo(43);
    expect(value.displayedPositions[0]).toEqual({ x: 43, y: 0 });
    expect(value.snapshot.positions.slice(1)).toEqual([
      { x: 80, y: 0 },
      { x: 160, y: 0 },
    ]);
    expect(value.snapshot.alpha).toBe(alphaBeforeRelease);
    expect(value.snapshot.active).toBe(2);
    value.advance(0);
    value.advance(17);
    expect(value.snapshot.positions[1]).not.toEqual({ x: 80, y: 0 });
    expect(value.snapshot.positions[2]).toEqual({ x: 160, y: 0 });
  });

  it("keeps frozen layouts still through force, size, play, and pointer entry paths", () => {
    const value = field();
    value.command({ kind: "set-frozen", frozen: true });
    const positions = value.snapshot.positions;
    value.setForceParams({ charge: -180 });
    value.setAppearanceParams({ nodeSizeScale: 1.3 });
    value.command({ kind: "sim-play" });
    value.pointer("pointerdown", 307, 300);
    value.pointer("pointermove", 337, 300);
    value.pointer("pointerup", 337, 300);
    value.advance(0);
    value.advance(1000);
    expect(value.snapshot.running).toBe(false);
    expect(value.snapshot.positions).toEqual(positions);
    expect(
      value.events.some((event) => event.kind === "sim-state" && event.running),
    ).toBe(false);
    value.command({ kind: "set-frozen", frozen: false });
    value.advance(2000);
    value.advance(2017);
    expect(value.snapshot.positions).not.toEqual(positions);
  });

  it("cancels an active drag and capture when freezing, so unfreeze cannot retain a drag hold", () => {
    const value = field();
    value.pointer("pointerdown", 300, 300);
    value.pointer("pointermove", 310, 300);
    value.advance(0);
    value.advance(17);
    value.command({ kind: "set-frozen", frozen: true });
    const frozen = value.snapshot;
    expect(value.hasGesture).toBe(false);
    expect(value.element.hasPointerCapture(1)).toBe(false);
    value.pointer("pointermove", 350, 300);
    value.pointer("pointerup", 350, 300);
    expect(value.snapshot).toEqual(frozen);
    value.command({ kind: "set-frozen", frozen: false });
    for (let frame = 0; frame < 600; frame++) value.advance(frame * (1000 / 60));
    expect(value.snapshot.settled).toBe(true);
    expect(value.snapshot.running).toBe(false);
  });

  it("repaints the committed drag endpoint when freezing before the next tick", () => {
    const value = field();
    value.advance(0);
    expect(value.hasPendingPaint).toBe(false);
    value.pointer("pointerdown", 307, 300);
    value.pointer("pointermove", 350, 300);
    const alphaBeforeFreeze = value.snapshot.alpha;
    value.command({ kind: "set-frozen", frozen: true });
    expect(value.snapshot.running).toBe(false);
    expect(value.snapshot.alpha).toBe(alphaBeforeFreeze);
    expect(value.displayedPositions[0]).toEqual({ x: 43, y: 0 });
    expect(value.hasPendingPaint).toBe(true);
  });

  it.each([false, true])(
    "cancels a %s active gesture before replacing numeric node indices",
    (active) => {
      const value = field();
      value.pointer("pointerdown", 300, 300);
      if (active) value.pointer("pointermove", 310, 300);
      value.load(["b", "a"]);
      const replacement = value.snapshot;
      expect(value.hasGesture).toBe(false);
      expect(value.element.hasPointerCapture(1)).toBe(false);
      value.pointer("pointermove", 350, 300);
      value.pointer("pointerup", 350, 300);
      expect(value.snapshot).toEqual(replacement);
      expect(value.events.some((event) => event.kind === "select")).toBe(false);
    },
  );

  it("stops running and reaches idle when a live graph is disposed to empty", () => {
    const value = field(false);
    value.advance(0);
    value.advance(17);
    expect(value.snapshot.running).toBe(true);
    value.removeGraph();
    expect(value.snapshot.running).toBe(false);
    expect(value.events).toContainEqual({ kind: "sim-state", running: false });
    value.advance(34);
    expect(value.hasScheduledFrame).toBe(false);
  });

  it.each([40, 60, 144])(
    "integrates the same real solver trajectory at %i Hz",
    (hz) => {
      const value = field(false);
      value.advance(0);
      for (let frame = 1; frame <= hz; frame++) value.advance((frame * 1000) / hz);
      const reference = new D3ForceSolver(2, [], [4, 4], D3_FORCE_DEFAULTS);
      reference.seed((i) => ({ x: i * 80, y: 0 }));
      reference.prewarmReflow(() => true, 0.3, 0);
      for (let tick = 0; tick < 60; tick++) reference.tick();
      expect(value.snapshot.alpha).toBe(reference.alpha());
      expect(value.snapshot.positions).toEqual([
        reference.position(0),
        reference.position(1),
      ]);
      reference.dispose();
    },
  );

  it("resumes without integrating idle time or the pre-pause fractional step", () => {
    const value = field(false);
    value.advance(0);
    value.advance(10);
    const before = value.snapshot;
    value.command({ kind: "set-simulation-active", active: false });
    value.command({ kind: "set-simulation-active", active: true });
    value.advance(60_000);
    value.advance(60_010);
    expect(value.snapshot).toEqual(before);
    value.advance(60_020);
    expect(value.snapshot.alpha).toBeLessThan(before.alpha!);
  });
});
