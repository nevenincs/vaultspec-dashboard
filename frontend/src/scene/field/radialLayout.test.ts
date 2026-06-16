// graph-layout-catalog W02.P05: the radial / tree layout (d3-hierarchy adoption).
// Asserts the salience-root policy, the selected-node override, per-component
// angular sectors, and the golden-position determinism contract (D5).

import { describe, expect, it } from "vitest";

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { radialLayout } from "./radialLayout";

const n = (id: string, salience?: number): SceneNodeData => ({
  id,
  kind: "doc",
  ...(salience !== undefined ? { salience } : {}),
});

const edge = (src: string, dst: string): SceneEdgeData => ({
  id: `e:${src}->${dst}`,
  src,
  dst,
  relation: "rel",
  tier: "structural", // a backbone tier (declared/structural) so it feeds layout
  confidence: 1,
});

/** Distance of a position from the field origin (the root sits at r=0). */
const radius = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);

describe("radialLayout", () => {
  it("places the salience-max root at the centre (r≈0) by default (D5)", () => {
    const nodes = [n("a", 0.2), n("b", 0.9), n("c", 0.5)];
    const edges = [edge("b", "a"), edge("b", "c")];
    const pos = radialLayout(nodes, edges);
    // b has the highest salience -> it is the root -> at the centre.
    expect(radius(pos.get("b")!)).toBeLessThan(1e-6);
    // Its neighbours sit out at a positive radius (one hop).
    expect(radius(pos.get("a")!)).toBeGreaterThan(0);
    expect(radius(pos.get("c")!)).toBeGreaterThan(0);
  });

  it("breaks a salience tie by degree, then by id (D5)", () => {
    // a and b tie on salience; b has degree 2, a has degree 1 -> b is the root.
    const nodes = [n("a", 0.5), n("b", 0.5), n("c", 0.1), n("d", 0.1)];
    const edges = [edge("a", "b"), edge("b", "c"), edge("b", "d")];
    const pos = radialLayout(nodes, edges);
    expect(radius(pos.get("b")!)).toBeLessThan(1e-6);
  });

  it("lets a selected node OVERRIDE the salience root (D5)", () => {
    const nodes = [n("a", 0.2), n("b", 0.9), n("c", 0.5)];
    const edges = [edge("b", "a"), edge("a", "c")];
    // Select a low-salience node: it becomes the root despite b being most salient.
    const pos = radialLayout(nodes, edges, "a");
    expect(radius(pos.get("a")!)).toBeLessThan(1e-6);
    expect(radius(pos.get("b")!)).toBeGreaterThan(0);
  });

  it("reads radial distance as hops from the root (BFS spanning tree, D4)", () => {
    // root -> mid -> leaf: leaf is two hops, so it sits further out than mid.
    const nodes = [n("root", 1), n("mid", 0.5), n("leaf", 0.1)];
    const edges = [edge("root", "mid"), edge("mid", "leaf")];
    const pos = radialLayout(nodes, edges);
    expect(radius(pos.get("root")!)).toBeLessThan(1e-6);
    expect(radius(pos.get("leaf")!)).toBeGreaterThan(radius(pos.get("mid")!));
  });

  it("lays disconnected components in SEPARATE angular sectors, not rings (D5)", () => {
    // Two disjoint two-node components. Their roots should land at DIFFERENT
    // angles (separate sectors), not the same angle at different radii.
    const nodes = [n("a", 0.9), n("b", 0.1), n("x", 0.8), n("y", 0.2)];
    const edges = [edge("a", "b"), edge("x", "y")];
    const pos = radialLayout(nodes, edges);
    const angleOf = (id: string) => {
      const p = pos.get(id)!;
      return Math.atan2(p.y, p.x);
    };
    // The two components' leaves (b, y) occupy distinct angular regions.
    expect(angleOf("b")).not.toBeCloseTo(angleOf("y"), 3);
  });

  it("is deterministic: same inputs -> same positions (golden, D5)", () => {
    const nodes = [n("a", 0.7), n("b", 0.3), n("c", 0.9), n("d", 0.1), n("e", 0.5)];
    const edges = [edge("c", "a"), edge("a", "b"), edge("c", "d"), edge("d", "e")];
    const first = radialLayout(nodes, edges);
    const second = radialLayout(nodes, edges);
    // Re-running with a SHUFFLED node order must not change the layout (the
    // module sorts internally; positions are a pure function of the slice).
    const shuffled = radialLayout([...nodes].reverse(), [...edges].reverse());
    for (const id of nodes.map((x) => x.id)) {
      expect(second.get(id)).toEqual(first.get(id));
      expect(shuffled.get(id)).toEqual(first.get(id));
    }
  });

  it("returns an empty map for an empty slice", () => {
    expect(radialLayout([], []).size).toBe(0);
  });
});
