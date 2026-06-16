// graph-layout-catalog W02.P05: the radial / tree layout (d3-hierarchy adoption).
// Asserts the salience-root policy, the selected-node override, per-component
// angular sectors, and the golden-position determinism contract (D5).

import { describe, expect, it } from "vitest";

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { radialLayout } from "./radialLayout";
import { linkageCoverage } from "./scorecard/linkageCoverage";

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

  it("gives two isolated singletons DISTINCT positions (no origin pile-up)", () => {
    // Two single-node components with NO edges: each is its own sector, so each
    // must land at its sector's representative point, never the shared origin.
    const nodes = [n("solo1", 0.5), n("solo2", 0.5)];
    const pos = radialLayout(nodes, []);
    const a = pos.get("solo1")!;
    const b = pos.get("solo2")!;
    // Neither sits at the origin, and the two are at distinct positions.
    expect(radius(a)).toBeGreaterThan(0);
    expect(radius(b)).toBeGreaterThan(0);
    expect(a.x === b.x && a.y === b.y).toBe(false);
  });

  it("returns an empty map for an empty slice", () => {
    expect(radialLayout([], []).size).toBe(0);
  });

  // W02.P07.S33/S36 (node-representation ADR D4): when no node in the slice carries
  // salience (the feature-granularity case — the engine serves salience at document
  // granularity only), the radial root falls back to the MAXIMUM-DEGREE node rather
  // than degenerating to the lowest-id node.
  it("falls back to the max-degree root when salience is absent (D4)", () => {
    // No node carries salience (feature granularity). `hub` has degree 3, every
    // other node degree 1, so the max-degree fallback selects `hub` as the root.
    // Crucially `hub` is NOT the lowest id (that is `a`), so a pure id tie-break
    // would have chosen wrong — this asserts the degree fallback, not id ordering.
    const nodes = [n("a"), n("b"), n("c"), n("hub")];
    const edges = [edge("hub", "a"), edge("hub", "b"), edge("hub", "c")];
    const pos = radialLayout(nodes, edges);
    expect(radius(pos.get("hub")!)).toBeLessThan(1e-6);
    // The leaves sit one hop out at a positive radius.
    expect(radius(pos.get("a")!)).toBeGreaterThan(0);
  });

  it("salience-absent root fallback is deterministic and id-tie-broken (D4)", () => {
    // Two nodes tie on max degree (2 each); the lower id wins the final tie-break.
    const nodes = [n("p"), n("q"), n("x"), n("y")];
    const edges = [edge("p", "x"), edge("p", "y"), edge("q", "x"), edge("q", "y")];
    const pos = radialLayout(nodes, edges);
    // p and q both have degree 2; p (lower id) is the deterministic root.
    expect(radius(pos.get("p")!)).toBeLessThan(1e-6);
    expect(radius(pos.get("q")!)).toBeGreaterThan(0);
  });

  it("a selected node still overrides the max-degree fallback (D4)", () => {
    const nodes = [n("a"), n("b"), n("c"), n("hub")];
    const edges = [edge("hub", "a"), edge("hub", "b"), edge("hub", "c")];
    // Select a leaf: it becomes the root despite `hub` having the max degree.
    const pos = radialLayout(nodes, edges, "a");
    expect(radius(pos.get("a")!)).toBeLessThan(1e-6);
    expect(radius(pos.get("hub")!)).toBeGreaterThan(0);
  });

  it("keeps the salience-first policy when any node carries salience", () => {
    // `lo` is salient (0.9) but low degree; `hub` has max degree but no salience.
    // Because at least one node carries salience, the salience-first policy holds
    // and `lo` wins the root over the higher-degree `hub`.
    const nodes = [n("lo", 0.9), n("a"), n("b"), n("hub")];
    const edges = [edge("lo", "hub"), edge("hub", "a"), edge("hub", "b")];
    const pos = radialLayout(nodes, edges);
    expect(radius(pos.get("lo")!)).toBeLessThan(1e-6);
  });
});

// W02.P07.S35/S36 (node-representation ADR D6): linkage coverage makes embedding /
// derivation linkage density observable per slice. These tests feed fixtures with
// KNOWN coverage and assert the reported embedding% / derivation% figures.
describe("linkageCoverage (D6)", () => {
  const embedded = (id: string): SceneNodeData => ({
    id,
    kind: "doc",
    embedding: [0.1, 0.2, 0.3],
  });
  const derived = (src: string, dst: string): SceneEdgeData => ({
    ...edge(src, dst),
    derivation: "generated-by",
  });

  it("reports half embedding presence and half derivation labelling", () => {
    // 4 nodes, 2 carry an embedding -> 50%. 2 edges, 1 carries derivation -> 50%.
    const nodes = [embedded("a"), embedded("b"), n("c"), n("d")];
    const edges = [derived("a", "b"), edge("c", "d")];
    const cov = linkageCoverage(nodes, edges);
    expect(cov.nodeCount).toBe(4);
    expect(cov.nodesWithEmbedding).toBe(2);
    expect(cov.embeddingPresence).toBeCloseTo(0.5, 10);
    expect(cov.edgeCount).toBe(2);
    expect(cov.edgesWithDerivation).toBe(1);
    expect(cov.derivationLabel).toBeCloseTo(0.5, 10);
  });

  it("reports full coverage when every node and edge carries linkage", () => {
    const nodes = [embedded("a"), embedded("b"), embedded("c")];
    const edges = [derived("a", "b"), derived("b", "c")];
    const cov = linkageCoverage(nodes, edges);
    expect(cov.embeddingPresence).toBe(1);
    expect(cov.derivationLabel).toBe(1);
  });

  it("treats an absent or empty embedding and a null derivation as un-covered", () => {
    // An empty-array embedding is NOT a real embedding; an absent derivation is null.
    const nodes: SceneNodeData[] = [{ id: "a", kind: "doc", embedding: [] }, n("b")];
    const edges = [edge("a", "b")];
    const cov = linkageCoverage(nodes, edges);
    expect(cov.nodesWithEmbedding).toBe(0);
    expect(cov.embeddingPresence).toBe(0);
    expect(cov.edgesWithDerivation).toBe(0);
    expect(cov.derivationLabel).toBe(0);
  });

  it("reports vacuous full coverage on an empty slice", () => {
    const cov = linkageCoverage([], []);
    expect(cov.embeddingPresence).toBe(1);
    expect(cov.derivationLabel).toBe(1);
    expect(cov.nodeCount).toBe(0);
    expect(cov.edgeCount).toBe(0);
  });
});
