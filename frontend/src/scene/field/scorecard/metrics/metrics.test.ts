// Load-bearing correctness for the per-family metric modules (graph-viz-scorecard
// ADR, W01.P02). This suite pins the properties that, if wrong, would silently give
// the gate false confidence: a known single crossing scores c=1; identical
// partitions give ARI=AMI=1 while a shuffled partition collapses to ~0; well-
// separated blobs score high on silhouette/trustworthiness while shuffled labels
// score low; a monotone tree gives depth-radius Spearman ~1; scale-normalized stress
// is INVARIANT to a uniform scaling of the layout. It is focused, not exhaustive.

import { describe, expect, it } from "vitest";

import { makePrng } from "../prng";
import { generateBlobs } from "../generators/blobs";
import { adjustedMutualInformation, adjustedRandIndex } from "./clusterMetrics";
import { greadability } from "./greadability";
import { scoreSemanticLayout } from "./semanticMetrics";
import { scoreRadialLayout } from "./radialMetrics";
import { type Position, scaleNormalizedStressQuality, spearman } from "./shared";
import type { SceneEdgeData } from "../../../sceneController";

// A trivial 2D projection of high-dim vectors: take the first two coordinates.
// For well-separated blobs whose centers differ in the leading dims this preserves
// the cluster structure, so the rank/label metrics should score high.
function project2D(vectors: number[][]): Position[] {
  return vectors.map((v) => ({ x: v[0] ?? 0, y: v[1] ?? 0 }));
}

describe("greadability crossings", () => {
  it("scores exactly one crossing for a single crossing pair", () => {
    // Two edges whose segments cross at the origin: A(-1,-1)->B(1,1) and
    // C(-1,1)->D(1,-1). They share no endpoint, so c_max = 1 and c = 1 -> quality 0.
    const positions = new Map<string, Position>([
      ["A", { x: -1, y: -1 }],
      ["B", { x: 1, y: 1 }],
      ["C", { x: -1, y: 1 }],
      ["D", { x: 1, y: -1 }],
    ]);
    const edges = [
      { src: "A", dst: "B" },
      { src: "C", dst: "D" },
    ];
    const g = greadability(positions, edges);
    expect(g.crossings).toBe(1);
    expect(g.maxCrossings).toBe(1);
    expect(g.crossingsQuality).toBe(0);
  });

  it("scores zero crossings for a non-crossing pair", () => {
    const positions = new Map<string, Position>([
      ["A", { x: 0, y: 0 }],
      ["B", { x: 1, y: 0 }],
      ["C", { x: 0, y: 2 }],
      ["D", { x: 1, y: 2 }],
    ]);
    const edges = [
      { src: "A", dst: "B" },
      { src: "C", dst: "D" },
    ];
    const g = greadability(positions, edges);
    expect(g.crossings).toBe(0);
    expect(g.crossingsQuality).toBe(1);
  });
});

describe("ARI and AMI chance correction", () => {
  it("scores identical partitions as 1", () => {
    const truth = [0, 0, 1, 1, 2, 2];
    const pred = [0, 0, 1, 1, 2, 2];
    expect(adjustedRandIndex(truth, pred)).toBeCloseTo(1, 10);
    expect(adjustedMutualInformation(truth, pred)).toBeCloseTo(1, 10);
  });

  it("scores a relabeled-but-identical partition as 1 (label-invariant)", () => {
    const truth = [0, 0, 1, 1, 2, 2];
    const pred = [2, 2, 0, 0, 1, 1]; // same grouping, different label names
    expect(adjustedRandIndex(truth, pred)).toBeCloseTo(1, 10);
    expect(adjustedMutualInformation(truth, pred)).toBeCloseTo(1, 10);
  });

  it("scores a shuffled (random) partition near 0, well below identical", () => {
    // A larger graph so chance correction has signal.
    const n = 60;
    const truth: number[] = [];
    for (let i = 0; i < n; i++) truth.push(i % 4);
    // A deterministic shuffle of the labels destroys the structure.
    const prng = makePrng(99);
    const shuffled = truth.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = prng.nextInt(0, i);
      const t = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = t;
    }
    const ari = adjustedRandIndex(truth, shuffled);
    const ami = adjustedMutualInformation(truth, shuffled);
    // Chance-corrected: a random partition scores near 0, far below the identical 1.
    expect(ari).toBeLessThan(0.25);
    expect(ami).toBeLessThan(0.25);
    expect(adjustedRandIndex(truth, truth)).toBeGreaterThan(0.99);
  });
});

describe("semantic metrics on blobs", () => {
  it("well-separated blobs score high; shuffled labels score low", () => {
    const blobs = generateBlobs({
      count: 60,
      dims: 6,
      clusters: 3,
      clusterStd: 0.2, // tight, well-separated
      seed: 5,
      centerSpread: 12,
    });
    const positions = project2D(blobs.vectors);
    const good = scoreSemanticLayout(blobs.vectors, positions, blobs.labels);
    // True labels: high neighbourhood-hit, silhouette, nearest-centroid,
    // trustworthiness.
    expect(good.neighborhoodHit).toBeGreaterThan(0.8);
    expect(good.silhouette).toBeGreaterThan(0.7);
    expect(good.nearestCentroid).toBeGreaterThan(0.9);
    expect(good.trustworthiness).toBeGreaterThan(0.8);

    // Shuffled labels: the geometry is unchanged but the labels no longer match the
    // clusters, so the label-aware metrics collapse.
    const prng = makePrng(7);
    const badLabels = blobs.labels.slice();
    for (let i = badLabels.length - 1; i > 0; i--) {
      const j = prng.nextInt(0, i);
      const t = badLabels[i];
      badLabels[i] = badLabels[j];
      badLabels[j] = t;
    }
    const bad = scoreSemanticLayout(blobs.vectors, positions, badLabels);
    expect(bad.neighborhoodHit).toBeLessThan(good.neighborhoodHit);
    expect(bad.nearestCentroid).toBeLessThan(good.nearestCentroid);
    expect(bad.silhouette).toBeLessThan(good.silhouette);
  });
});

describe("radial depth-radius monotonicity", () => {
  it("a monotone tree gives depth-radius Spearman ~1", () => {
    // A perfect concentric tree: root at center, depth-d nodes on a ring of radius
    // d. depth-radius rank correlation must be ~1 -> score ~1.
    const layerOf = new Map<string, number>();
    const positions = new Map<string, Position>();
    const edges: SceneEdgeData[] = [];
    layerOf.set("root", 0);
    positions.set("root", { x: 0, y: 0 });
    // Two children per node, two depths.
    let counter = 0;
    const ring = (depth: number, angle: number): Position => ({
      x: depth * Math.cos(angle),
      y: depth * Math.sin(angle),
    });
    const d1 = ["a", "b", "c"];
    d1.forEach((id, i) => {
      layerOf.set(id, 1);
      positions.set(id, ring(1, (i / d1.length) * 2 * Math.PI));
      edges.push({
        id: `e${counter++}`,
        src: "root",
        dst: id,
        relation: "r",
        tier: "structural",
        confidence: 1,
      });
    });
    const d2 = ["a1", "a2", "b1", "c1"];
    d2.forEach((id, i) => {
      layerOf.set(id, 2);
      positions.set(id, ring(2, (i / d2.length) * 2 * Math.PI + 0.3));
      const parent = d1[i % d1.length];
      edges.push({
        id: `e${counter++}`,
        src: parent,
        dst: id,
        relation: "r",
        tier: "structural",
        confidence: 1,
      });
    });
    const m = scoreRadialLayout(positions, layerOf, "root", edges);
    expect(m.depthRadius).toBeGreaterThan(0.95);

    // Spearman itself on the monotone series is ~1.
    expect(spearman([0, 1, 1, 2, 2], [0, 1, 1, 2, 2])).toBeCloseTo(1, 10);
  });
});

describe("scale-normalized stress invariance", () => {
  it("is invariant to a uniform scaling of the layout", () => {
    // High-dim "distances" and a low-dim drawing; scaling every low-dim distance by
    // a constant must not change the quality, because alpha absorbs the scale.
    const base = [
      { dHi: 1, dLo: 2 },
      { dHi: 2, dLo: 3.9 },
      { dHi: 3, dLo: 6.2 },
      { dHi: 4, dLo: 7.8 },
      { dHi: 5, dLo: 10.1 },
    ];
    const q1 = scaleNormalizedStressQuality(base);
    // Scale every low-dim distance by 5x (a uniform zoom of the drawing).
    const scaled = base.map((p) => ({ dHi: p.dHi, dLo: p.dLo * 5 }));
    const q2 = scaleNormalizedStressQuality(scaled);
    expect(q2).toBeCloseTo(q1, 10);
    // And a tiny-scale (0.01x) version is equally invariant.
    const tiny = base.map((p) => ({ dHi: p.dHi, dLo: p.dLo * 0.01 }));
    expect(scaleNormalizedStressQuality(tiny)).toBeCloseTo(q1, 10);
  });

  it("scores a perfectly proportional embedding as ~1", () => {
    const perfect = [
      { dHi: 1, dLo: 3 },
      { dHi: 2, dLo: 6 },
      { dHi: 3, dLo: 9 },
      { dHi: 4, dLo: 12 },
    ];
    expect(scaleNormalizedStressQuality(perfect)).toBeCloseTo(1, 10);
  });
});
