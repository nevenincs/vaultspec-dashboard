// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BufferAttribute, WebGLRenderer } from "three";
import {
  SceneController,
  type SceneNodeData,
  type SceneEdgeData,
} from "../sceneController";
import { ThreeField } from "./threeField";
import { edgeAppearance, nodeColorNumber } from "./appearance";

/** Real solver, scene graph and buffer attributes; no WebGL context is required
 * to exercise data commands. Only the renderer device boundary is omitted. */
class DataField extends ThreeField {
  readonly element = document.createElement("div");
  constructor() {
    super();
    this.renderer = {
      domElement: this.element,
      setSize() {},
      setClearColor() {},
    } as unknown as WebGLRenderer;
    this.controller = new SceneController(this);
    this.appearance.nodeIcons = false;
    this.autoframe = false;
    this.attachInteraction(this.element);
    this.frozen = true;
    this.resize(600, 600);
  }
  protected override requestRender(): void {
    this.needsRender = true;
  }
  protected override wake(): void {}
  override destroy(): void {
    this.renderer = null;
    super.destroy();
  }
  prepare(settled = true): void {
    this.solver!.seed((i) => ({ x: i * 80, y: 0 }));
    this.solver!.prewarmReflow(() => !settled, 0.3, 0);
    this.solver!.pack(this.simPositions);
    this.cpuPositions.set(this.simPositions);
    this.camera.position.set(0, 0, 10);
    this.camera.zoom = 1;
    this.resize(600, 600);
  }
  step(): void {
    this.solver!.tick();
  }
  pointer(kind: string, x: number, y: number): void {
    this.element.dispatchEvent(
      new PointerEvent(kind, { pointerId: 1, button: 0, clientX: x, clientY: y }),
    );
  }
  suspendCamera(): void {
    this.autoframeSuspended = true;
  }
  restoreContext(): void {
    this.onContextRestored();
  }
  get snapshot() {
    return {
      solver: this.solver,
      texture: this.positionTex,
      node: this.nodeMesh,
      edge: this.edgeMesh,
      glyph: this.glyphMesh,
      nodeGeometry: this.nodeMesh?.geometry,
      edgeGeometry: this.edgeMesh?.geometry,
      colors: this.nodeColors.slice(),
      nodes: this.nodes,
      edges: this.edgeData,
      cohort: this.featureCohort,
      visible: this.visibleNodeIds,
      hovered: this.hoveredId,
      selected: this.selectedIds,
      spotlight: this.spotlightFeatureTag,
      suspended: this.autoframeSuspended,
      pendingFocus: this.pendingFocusId,
      alpha: this.solver?.alpha(),
      positions: this.nodes.map((_, i) => this.solver?.position(i)),
      displayed: Array.from(this.cpuPositions),
      running: this.running,
      gesture: this.pointerGesture,
      dragActive: this.dragActive,
    };
  }
}

const nodes = (): SceneNodeData[] =>
  ["a", "b", "c"].map((id) => ({
    id,
    kind: "document",
    docType: "adr",
    title: id,
    featureTags: ["old"],
  }));
const edge = (src: string, dst: string, id = src + dst): SceneEdgeData => ({
  id,
  src,
  dst,
  relation: "relates",
  tier: "declared",
  confidence: 0.6,
});
const edges = () => [edge("a", "b"), edge("b", "c")];
const fields: DataField[] = [];
function field(): DataField {
  const value = new DataField();
  fields.push(value);
  value.command({ kind: "set-data", nodes: nodes(), edges: edges() });
  value.prepare();
  return value;
}
afterEach(() => {
  for (const value of fields) value.destroy();
  fields.length = 0;
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("style");
});

describe("compatible scene data updates", () => {
  it("retains solver, texture, geometry and unchanged attribute versions without ticking", () => {
    const value = field();
    const before = value.snapshot;
    const color = before.nodeGeometry!.getAttribute("aColor") as BufferAttribute;
    const version = color.version;
    const tick = vi.spyOn(before.solver!, "tick");
    value.command({ kind: "set-data", nodes: nodes(), edges: edges() });
    const after = value.snapshot;
    expect(after.solver).toBe(before.solver);
    expect(after.texture).toBe(before.texture);
    expect(after.nodeGeometry).toBe(before.nodeGeometry);
    expect(after.edgeGeometry).toBe(before.edgeGeometry);
    expect(color.version).toBe(version);
    expect(after.alpha).toBe(before.alpha);
    expect(after.positions).toEqual(before.positions);
    expect(tick).not.toHaveBeenCalled();
  });

  it("updates metadata, feature cohorts, node colors and edge attributes in place", () => {
    const value = field();
    const before = value.snapshot;
    const updatedNodes = nodes();
    updatedNodes[0] = {
      ...updatedNodes[0],
      title: "Updated",
      docType: "plan",
      featureTags: ["new"],
    };
    const updatedEdges = edges();
    updatedEdges[0] = {
      ...updatedEdges[0],
      id: "new-edge-id",
      tier: "semantic",
      state: "broken",
      confidence: 0.2,
    };
    value.command({ kind: "set-data", nodes: updatedNodes, edges: updatedEdges });
    const after = value.snapshot;
    expect(after.solver).toBe(before.solver);
    expect(after.nodeGeometry).toBe(before.nodeGeometry);
    expect(after.edgeGeometry).toBe(before.edgeGeometry);
    expect(after.nodes).toBe(updatedNodes);
    expect(after.edges[0]).toBe(updatedEdges[0]);
    expect(after.cohort.get("new")).toEqual(new Set(["a"]));
    expect(after.cohort.get("old")).toEqual(new Set(["b", "c"]));
    expect(after.colors[0]).toBe(nodeColorNumber(updatedNodes[0]));
    const appearance = edgeAppearance(updatedEdges[0]);
    expect(after.edgeGeometry!.getAttribute("aAlpha").getX(0)).toBeCloseTo(
      appearance.alpha,
    );
    expect(after.edgeGeometry!.getAttribute("aWidthPx").getX(0)).toBeCloseTo(
      appearance.width,
    );
    expect(after.alpha).toBe(before.alpha);
  });

  it("continues the exact in-flight solver trajectory across metadata updates", () => {
    const value = field();
    const control = field();
    value.prepare(false);
    control.prepare(false);
    value.step();
    control.step();
    const before = value.snapshot;
    value.command({ kind: "set-data", nodes: nodes(), edges: edges() });
    expect(value.snapshot.solver).toBe(before.solver);
    expect(value.snapshot.alpha).toBe(before.alpha);
    for (let i = 0; i < 12; i++) {
      value.step();
      control.step();
    }
    expect(value.snapshot.positions).toEqual(control.snapshot.positions);
    expect(value.snapshot.alpha).toEqual(control.snapshot.alpha);
    expect(value.snapshot.running).toBe(false); // frozen updates never resume
    value.command({ kind: "set-frozen", frozen: false });
    expect(value.snapshot.running).toBe(true);
  });

  it("updates cached glyph cells and colors even while icons are hidden", () => {
    const value = field();
    value.setAppearanceParams({ nodeIcons: true });
    const glyph = value.snapshot.glyph!;
    const oldCell = glyph.geometry.getAttribute("aCell").getX(0);
    value.setAppearanceParams({ nodeIcons: false });
    const updated = nodes();
    updated[0].docType = "plan";
    value.command({ kind: "set-data", nodes: updated, edges: edges() });
    expect(value.snapshot.glyph).toBe(glyph);
    expect(glyph.visible).toBe(false);
    expect(glyph.geometry.getAttribute("aCell").getX(0)).not.toBe(oldCell);
    expect(Array.from(glyph.geometry.getAttribute("aColor").array)).toEqual(
      Array.from(value.snapshot.nodeGeometry!.getAttribute("aColor").array),
    );
    value.setAppearanceParams({ nodeIcons: true });
    expect(value.snapshot.glyph).toBe(glyph);
    expect(glyph.visible).toBe(true);
  });

  it("invalidates theme palettes on refresh and reuses the refreshed resources", () => {
    const value = field();
    const solver = value.snapshot.solver;
    document.documentElement.style.setProperty(
      "--color-scene-category-adr",
      "rgb(10, 20, 30)",
    );
    value.command({ kind: "refresh-theme" });
    const refreshed = value.snapshot;
    expect(refreshed.colors[0]).toBe(0x0a141e);
    expect(refreshed.solver).toBe(solver);
    value.command({ kind: "set-data", nodes: nodes(), edges: edges() });
    expect(value.snapshot.node).toBe(refreshed.node);
    expect(value.snapshot.colors[0]).toBe(0x0a141e);
  });

  it.each([
    "order",
    "orientation",
    "multiplicity",
    "node-order",
    "radius",
    "reset",
    "reflow",
  ])("rebuilds on incompatible %s", (change) => {
    const value = field();
    const before = value.snapshot;
    const nextNodes = nodes();
    const nextEdges = edges();
    if (change === "order") nextEdges.reverse();
    if (change === "orientation") nextEdges[0] = edge("b", "a");
    if (change === "multiplicity") nextEdges.push(edge("a", "b", "duplicate"));
    if (change === "node-order") nextNodes.reverse();
    if (change === "radius") nextNodes[0].salience = 0.9;
    value.command({
      kind: "set-data",
      nodes: nextNodes,
      edges: nextEdges,
      reset: change === "reset",
      reflow: change === "reflow",
    });
    expect(value.snapshot.solver).not.toBe(before.solver);
    expect(value.snapshot.texture).not.toBe(before.texture);
  });

  it("compares physical radii independently of caller mutation and Float32 rounding", () => {
    const value = field();
    const before = value.snapshot;
    before.nodes[0].salience = Number.EPSILON;
    value.command({ kind: "set-data", nodes: before.nodes, edges: before.edges });
    expect(value.snapshot.solver).not.toBe(before.solver);
  });

  it("can reuse after a size retune and ignores unresolved/self edges", () => {
    const value = field();
    value.setAppearanceParams({ nodeSizeScale: 1.4 });
    const before = value.snapshot;
    value.command({
      kind: "set-data",
      nodes: nodes(),
      edges: [edge("missing", "a"), edge("a", "a"), ...edges()],
    });
    expect(value.snapshot.solver).toBe(before.solver);
    expect(value.snapshot.edges).toEqual(edges());
  });

  it("clears old hover and visibility but retains selection and recomputes spotlight", () => {
    const value = field();
    value.command({ kind: "set-selected", ids: new Set(["a"]) });
    value.command({ kind: "set-feature-spotlight", tag: "old" });
    value.command({
      kind: "set-visibility",
      visibleNodeIds: new Set(["a"]),
      visibleEdgeIds: new Set(),
    });
    value.pointer("pointermove", 300, 300);
    value.command({ kind: "set-data", nodes: nodes(), edges: edges() });
    const after = value.snapshot;
    expect(after.hovered).toBeNull();
    expect(after.visible).toBeNull();
    expect(after.selected).toEqual(new Set(["a"]));
    expect(after.spotlight).toBe("old");
    expect(Array.from(after.nodeGeometry!.getAttribute("aHidden").array)).toEqual([
      0, 0, 0,
    ]);
    expect(after.edgeGeometry!.getAttribute("aAlpha").getX(0)).toBeGreaterThan(0);
  });

  it("preserves ambient camera suspension while explicit data reengages it", () => {
    const value = field();
    value.command({ kind: "set-autoframe", enabled: true });
    value.suspendCamera();
    value.command({
      kind: "apply-deltas",
      seq: 1,
      deltas: [
        { op: "change", t: 0, seq: 1, node: { ...nodes()[0], title: "Changed" } },
      ],
    });
    expect(value.snapshot.suspended).toBe(true);
    value.command({ kind: "set-data", nodes: nodes(), edges: edges() });
    expect(value.snapshot.suspended).toBe(false);
  });

  it("cancels a sub-tick drag and carries its committed endpoint into reuse", () => {
    const value = field();
    value.command({ kind: "set-frozen", frozen: false });
    value.pointer("pointerdown", 300, 300);
    value.pointer("pointermove", 340, 300);
    const before = value.snapshot;
    value.command({ kind: "set-data", nodes: nodes(), edges: edges() });
    expect(value.snapshot.solver).toBe(before.solver);
    expect(value.snapshot.gesture).toBeNull();
    expect(value.snapshot.dragActive).toBe(false);
    expect(value.snapshot.positions[0]?.x).toBeCloseTo(40);
    expect(value.snapshot.positions[0]?.y).toBe(0);
    expect(value.snapshot.displayed[0]).toBe(40);
    const after = value.snapshot.positions;
    value.pointer("pointermove", 380, 300);
    value.pointer("pointerup", 380, 300);
    expect(value.snapshot.positions).toEqual(after);
  });

  it("recreates GPU resources on context restoration, then safely reuses those replacements", () => {
    const value = field();
    const before = value.snapshot;
    value.restoreContext();
    const restored = value.snapshot;
    expect(restored.solver).toBe(before.solver);
    expect(restored.texture).not.toBe(before.texture);
    value.command({ kind: "set-data", nodes: nodes(), edges: edges() });
    expect(value.snapshot.texture).toBe(restored.texture);
    value.command({ kind: "set-data", nodes: [], edges: [] });
    expect(value.snapshot.solver).toBeNull();
    expect(value.snapshot.node).toBeNull();
    expect(value.snapshot.positions).toEqual([]);
    expect(value.snapshot.running).toBe(false);
  });

  it("resolves style once per node build, not once per node", () => {
    const value = field();
    const styles = vi.spyOn(globalThis, "getComputedStyle");
    const many = Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      kind: "document",
      docType: "plan",
    }));
    value.command({ kind: "set-data", nodes: many, edges: [], reset: true });
    expect(styles.mock.calls.length).toBeLessThan(5);
  });
});
