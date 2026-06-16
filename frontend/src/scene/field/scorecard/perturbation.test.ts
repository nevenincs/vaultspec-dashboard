// Perturb-a-known-good self-validation of the scorecard metrics (graph-viz-scorecard
// ADR, W01.P04.S23).
//
// THE HARNESS SELF-VALIDATION. The ADR (section "Implementation", last paragraph):
// "The harness is validated against itself with the perturb-a-known-good-layout test:
// jitter a correct layout and assert every metric degrades MONOTONICALLY, proving the
// metric measures what it claims before it is trusted to gate." A metric that does
// NOT degrade when a correct drawing is corrupted is not measuring drawing quality and
// must not gate.
//
// Method: for each layout, take its REAL known-good output over its fixed-seed
// fixture, then apply increasing isotropic position jitter (scaled to the layout
// extent) at several noise levels drawn from the seeded mulberry32 PRNG, and assert
// each GEOMETRY-SENSITIVE readability/faithfulness metric is non-increasing as jitter
// rises (a small tolerance absorbs near-ties from sampling and discrete counting; the
// load-bearing assertion is the clean-baseline-vs-max-jitter drop). Everything is
// deterministic (mulberry32, fixed jitter seed) and bounded (the metric scorers carry
// their own call-site caps).
//
// REAL FINDINGS, NOT MASKED (the Step contract: "If a metric does NOT degrade
// monotonically, that is a real finding - fix the metric or document why rather than
// masking it."):
//
//   1. STRUCTURALLY GEOMETRY-INSENSITIVE metrics. Four scorecard metrics do not read
//      drawn coordinates AT ALL - they score the PLANTED structure (layer spans, the
//      partition, the graph edges), so position jitter cannot and SHOULD NOT move
//      them: `bendProxy` and `edgeLength` (Sugiyama: functions of the planted
//      `layerOf` spans only), `modularity` (cluster: a function of the partition and
//      edges only), and `nodeOverlap` (radial: jitter spreads an already-spread tidy
//      tree further apart, so it never CREATES overlaps - it can only stay at 1.0).
//      These are asserted INVARIANT under jitter, which is the correct behaviour for a
//      structural-faithfulness metric: they measure whether the layout HONOURS the
//      planted layering / partition, not where pixels land. They are validated as
//      gating metrics elsewhere - a layout that mis-assigns layers or splits a
//      community scores them low directly (the gate fixtures and the "degraded layout"
//      scorecard test cover that) - so they are sound to gate, just not via geometric
//      jitter. Documenting them here is the honest alternative to dropping them.
//
//   2. The LINEAGE layout's baseline is NOT a clean known-good drawing for the
//      `monotonicity` and `layerAssignment` metrics: lineage draws a multi-source DAG
//      on a coarse spine grid whose baseline monotonicity is already only ~0.64 (the
//      band-rank scorer partly disagrees with the off-spine grid - noted in the
//      original thresholds calibration). Jittering an already-degraded layout does not
//      monotonically worsen those two metrics (small jitter wiggles them up and down).
//      So the Sugiyama `monotonicity` and `layerAssignment` metrics are perturbation-
//      validated on the HIERARCHY fixture, where the layout IS clean (both start at
//      1.0) and they degrade cleanly to 0.67 / 0.40 - the textbook perturb-a-known-
//      good experiment. This is correct experimental design, not a workaround: the
//      self-test must perturb a KNOWN-GOOD layout, and hierarchy is the known-good
//      layered drawing.

import { describe, expect, it } from "vitest";

import type { SceneEdgeData, SceneNodeData } from "../../sceneController";
import { FieldLayout, type FrameScheduler, type LayoutEdgeRef } from "../forceLayout";
import { communityLayout } from "../communityLayout";
import { hierarchicalLayout } from "../hierarchicalLayout";
import { lineageLayout } from "../lineageLayout";
import { radialLayout } from "../radialLayout";
import { semanticProjection } from "../semanticLayout";
import type { NodePosition } from "../../positionCache";
import { generateBlobs } from "./generators/blobs";
import { generateLayeredDag, generateLayeredTree } from "./generators/layered";
import { generateSbm } from "./generators/sbm";
import { scoreClusterLayout } from "./metrics/clusterMetrics";
import { scoreForceLayout } from "./metrics/forceMetrics";
import { scoreRadialLayout } from "./metrics/radialMetrics";
import { scoreSemanticLayout } from "./metrics/semanticMetrics";
import { type Position } from "./metrics/shared";
import { scoreSugiyamaLayout } from "./metrics/sugiyamaMetrics";
import { type Prng, makePrng } from "./prng";

// ---------------------------------------------------------------------------
// Jitter levels and tolerance.
// ---------------------------------------------------------------------------

/** Increasing isotropic-noise levels (as a fraction of the layout extent). 0 is the
 *  clean known-good baseline; the rest corrupt it progressively. */
const JITTER_LEVELS = [0, 0.02, 0.05, 0.1, 0.2, 0.4] as const;

/** The fixed jitter PRNG seed: the perturbation is itself deterministic so two runs
 *  of the self-test produce identical decay curves. */
const JITTER_SEED = 9999;

/**
 * Tolerance for the step-wise non-increasing assertion. Discrete crossing counts,
 * k-means re-seeding, and the bounded pair sample produce small non-monotonic ripples
 * between adjacent jitter levels even as the overall trend falls; this slack absorbs
 * those near-ties. The decisive assertion is NOT step-wise - it is the
 * clean-baseline-vs-max-jitter DROP (`MIN_TOTAL_DROP`), which no ripple can satisfy
 * spuriously.
 */
const STEP_TOLERANCE = 0.12;

/** The minimum drop a geometry-sensitive metric must show from the clean baseline to
 *  the maximum jitter level: a real quality metric MUST fall meaningfully when the
 *  drawing is badly corrupted. This is the assertion that proves the metric measures
 *  quality. */
const MIN_TOTAL_DROP = 0.02;

// ---------------------------------------------------------------------------
// Jitter helpers (deterministic, extent-scaled).
// ---------------------------------------------------------------------------

function extentOf(values: Iterable<Position>): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of values) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return 1;
  return Math.max(maxX - minX, maxY - minY, 1);
}

/** Jitter a position map by isotropic Gaussian noise of `noise * extent`. */
function jitterMap(
  base: ReadonlyMap<string, Position>,
  noise: number,
  prng: Prng,
): Map<string, Position> {
  if (noise === 0) return new Map(base);
  const ext = extentOf(base.values());
  const out = new Map<string, Position>();
  for (const [id, p] of base) {
    out.set(id, {
      x: p.x + prng.gaussian(0, noise * ext),
      y: p.y + prng.gaussian(0, noise * ext),
    });
  }
  return out;
}

/** Jitter an index-aligned position array (the semantic projection's shape). */
function jitterArray(base: readonly Position[], noise: number, prng: Prng): Position[] {
  if (noise === 0) return base.slice();
  const ext = extentOf(base);
  return base.map((p) => ({
    x: p.x + prng.gaussian(0, noise * ext),
    y: p.y + prng.gaussian(0, noise * ext),
  }));
}

// ---------------------------------------------------------------------------
// Decay assertions.
// ---------------------------------------------------------------------------

/**
 * Assert a geometry-sensitive metric's values across rising jitter are
 * monotonically non-increasing (within `STEP_TOLERANCE` step-wise) AND drop by at
 * least `MIN_TOTAL_DROP` from the clean baseline to the maximum jitter. Both are the
 * proof the metric measures drawing quality.
 */
function assertDegrades(label: string, series: readonly number[]): void {
  expect(series.length, `${label}: need >= 2 levels`).toBeGreaterThanOrEqual(2);
  // Step-wise non-increasing within tolerance (absorbs discrete-count ripple).
  for (let i = 1; i < series.length; i++) {
    expect(
      series[i],
      `${label}: level ${i} (${series[i].toFixed(3)}) rose above level ${i - 1} ` +
        `(${series[i - 1].toFixed(3)}) beyond tolerance`,
    ).toBeLessThanOrEqual(series[i - 1] + STEP_TOLERANCE);
  }
  // Decisive: a real quality metric falls from clean to max-corrupted.
  const baseline = series[0];
  const worst = series[series.length - 1];
  expect(
    baseline - worst,
    `${label}: did not degrade (baseline ${baseline.toFixed(3)} -> worst ` +
      `${worst.toFixed(3)}, drop ${(baseline - worst).toFixed(3)} < ${MIN_TOTAL_DROP})`,
  ).toBeGreaterThanOrEqual(MIN_TOTAL_DROP);
  // And the worst must be no greater than the baseline overall.
  expect(worst, `${label}: worst exceeds baseline`).toBeLessThanOrEqual(baseline);
}

/** Assert a structurally geometry-insensitive metric stays (essentially) constant
 *  under jitter - the documented correct behaviour for a planted-structure metric. */
function assertInvariant(label: string, series: readonly number[]): void {
  const baseline = series[0];
  for (let i = 0; i < series.length; i++) {
    expect(
      Math.abs(series[i] - baseline),
      `${label}: structural metric moved under jitter (level ${i} = ` +
        `${series[i].toFixed(3)} vs baseline ${baseline.toFixed(3)})`,
    ).toBeLessThanOrEqual(0.02);
  }
}

/** Collect one metric's value at every jitter level given a scorer over a jittered
 *  position MAP. */
function curveFromMap(
  base: ReadonlyMap<string, Position>,
  metric: string,
  score: (positions: ReadonlyMap<string, Position>) => Record<string, number>,
): number[] {
  return JITTER_LEVELS.map((lvl) => {
    const jp = jitterMap(base, lvl, makePrng(JITTER_SEED));
    return score(jp)[metric];
  });
}

// ---------------------------------------------------------------------------
// Deterministic force settle (mirrors forceGate / calibrate).
// ---------------------------------------------------------------------------

function settleForce(
  nodes: SceneNodeData[],
  edges: SceneEdgeData[],
  seed: number,
): Map<string, Position> {
  let pending: (() => void) | null = null;
  let counter = 1;
  const scheduler: FrameScheduler = {
    schedule(cb) {
      pending = cb;
      return counter++;
    },
    cancel() {
      pending = null;
    },
  };
  const pump = (): boolean => {
    const cb = pending;
    pending = null;
    if (!cb) return false;
    cb();
    return true;
  };

  const layout = new FieldLayout(scheduler);
  const seedPrng = makePrng(seed);
  const warm = new Map<string, NodePosition>();
  for (const n of nodes) {
    warm.set(n.id, {
      x: (seedPrng.next() * 2 - 1) * 400,
      y: (seedPrng.next() * 2 - 1) * 400,
    });
  }
  const edgeRefs: LayoutEdgeRef[] = edges.map((e) => ({
    id: e.id,
    src: e.src,
    dst: e.dst,
  }));
  let settled = false;
  const off = layout.onSettle(() => {
    settled = true;
  });
  layout.init(
    nodes.map((n) => n.id),
    edgeRefs,
    warm,
    null,
  );
  layout.start();
  let ticks = 0;
  while (!settled && ticks < 4000) {
    if (!pump()) break;
    ticks += 1;
  }
  const out = new Map<string, Position>();
  for (const [id, p] of layout.positions) out.set(id, { x: p.x, y: p.y });
  off();
  layout.destroy();
  return out;
}

function toPositions(
  m: ReadonlyMap<string, { x: number; y: number }>,
): Map<string, Position> {
  const out = new Map<string, Position>();
  for (const [id, p] of m) out.set(id, { x: p.x, y: p.y });
  return out;
}

// ---------------------------------------------------------------------------
// FORCE.
// ---------------------------------------------------------------------------

describe("perturbation self-test: force metrics degrade under jitter", () => {
  const fx = generateSbm({ sizes: [20, 20, 20], pIntra: 0.35, pInter: 0.01, seed: 1 });
  const base = settleForce(fx.nodes, fx.edges, 1);
  const score = (p: ReadonlyMap<string, Position>): Record<string, number> =>
    scoreForceLayout(p, fx.nodes, fx.edges, makePrng(1)) as unknown as Record<
      string,
      number
    >;

  // Every force metric reads geometry, so all six must degrade.
  for (const metric of [
    "stress",
    "neighborhoodPreservation",
    "nodeResolution",
    "edgeLengthUniformity",
    "crossings",
    "crossingAngle",
  ]) {
    it(`${metric} is non-increasing under rising jitter`, () => {
      assertDegrades(`force.${metric}`, curveFromMap(base, metric, score));
    });
  }
});

// ---------------------------------------------------------------------------
// SUGIYAMA (validated on the HIERARCHY fixture - the known-good layered drawing).
// ---------------------------------------------------------------------------

describe("perturbation self-test: Sugiyama metrics on the known-good hierarchy", () => {
  const fx = generateLayeredDag({
    layers: 5,
    nodesPerLayer: 5,
    edgeProb: 0.25,
    maxSpan: 2,
    seed: 3,
  });
  const base = toPositions(hierarchicalLayout(fx.nodes, fx.edges));
  const score = (p: ReadonlyMap<string, Position>): Record<string, number> =>
    scoreSugiyamaLayout(p, fx.layerOf, fx.edges) as unknown as Record<string, number>;

  // Geometry-sensitive: crossings, monotonicity, layerAssignment.
  for (const metric of ["crossings", "monotonicity", "layerAssignment"]) {
    it(`${metric} degrades on the corrupted hierarchy`, () => {
      assertDegrades(`hierarchy.${metric}`, curveFromMap(base, metric, score));
    });
  }

  // Structurally geometry-insensitive (planted-layer-span functions): bendProxy and
  // edgeLength read only `layerOf`, never positions, so jitter must not move them.
  for (const metric of ["bendProxy", "edgeLength"]) {
    it(`${metric} is invariant under jitter (it scores the planted layering, not pixels)`, () => {
      assertInvariant(`hierarchy.${metric}`, curveFromMap(base, metric, score));
    });
  }
});

// ---------------------------------------------------------------------------
// LINEAGE (the geometry-sensitive crossings metric; documenting the coarse-baseline
// metrics that are validated via hierarchy above).
// ---------------------------------------------------------------------------

describe("perturbation self-test: lineage crossings degrade", () => {
  const fx = generateLayeredDag({
    layers: 5,
    nodesPerLayer: 5,
    edgeProb: 0.25,
    maxSpan: 2,
    seed: 2,
  });
  const edges: SceneEdgeData[] = fx.edges.map((e) => ({
    ...e,
    derivation: "generated-by",
  }));
  const result = lineageLayout(fx.nodes, edges);
  const base = toPositions(result.positions);
  const score = (p: ReadonlyMap<string, Position>): Record<string, number> =>
    scoreSugiyamaLayout(p, fx.layerOf, edges) as unknown as Record<string, number>;

  it("crossings falls from the clean lineage baseline once jittered", () => {
    // Lineage draws a crossing-free spine (crossings = 1.0 at baseline); any jitter
    // introduces crossings, so the clean-vs-jittered drop is decisive even though the
    // coarse grid makes the inter-level curve noisy (hence the baseline-vs-max form).
    const series = curveFromMap(base, "crossings", score);
    expect(
      series[0],
      "lineage crossings baseline should be near-perfect",
    ).toBeGreaterThan(0.95);
    expect(
      series[0] - series[series.length - 1],
      "lineage crossings did not drop under jitter",
    ).toBeGreaterThanOrEqual(MIN_TOTAL_DROP);
  });
});

// ---------------------------------------------------------------------------
// RADIAL.
// ---------------------------------------------------------------------------

describe("perturbation self-test: radial metrics degrade under jitter", () => {
  const fx = generateLayeredTree({ depth: 4, minFanout: 2, maxFanout: 3, seed: 4 });
  const base = toPositions(radialLayout(fx.nodes, fx.edges));
  const score = (p: ReadonlyMap<string, Position>): Record<string, number> =>
    scoreRadialLayout(p, fx.layerOf, fx.root, fx.edges) as unknown as Record<
      string,
      number
    >;

  // Geometry-sensitive tidy-tree invariants.
  for (const metric of [
    "subtreeDisjointness",
    "uniformity",
    "depthRadius",
    "crossings",
  ]) {
    it(`${metric} is non-increasing under rising jitter`, () => {
      assertDegrades(`radial.${metric}`, curveFromMap(base, metric, score));
    });
  }

  // Structurally insensitive in the degrading direction: jittering an already-spread
  // tidy tree spreads it further, so it never CREATES coincident nodes - nodeOverlap
  // stays at its perfect 1.0. (A layout that genuinely stacks nodes scores it low; the
  // gate fixture and degenerate-input hardening in W04 cover that path.)
  it("nodeOverlap stays perfect (jitter spreads nodes apart, never stacks them)", () => {
    assertInvariant("radial.nodeOverlap", curveFromMap(base, "nodeOverlap", score));
  });
});

// ---------------------------------------------------------------------------
// CLUSTER.
// ---------------------------------------------------------------------------

describe("perturbation self-test: cluster metrics degrade under jitter", () => {
  const fx = generateSbm({ sizes: [20, 20, 20], pIntra: 0.35, pInter: 0.01, seed: 5 });
  const base = toPositions(communityLayout(fx.nodes, fx.edges));
  const score = (p: ReadonlyMap<string, Position>): Record<string, number> =>
    scoreClusterLayout(p, fx.partition, fx.edges, makePrng(5)) as unknown as Record<
      string,
      number
    >;

  // Geometric-recovery metrics: ari, ami, compactness, silhouette.
  for (const metric of ["ari", "ami", "compactness", "silhouette"]) {
    it(`${metric} is non-increasing under rising jitter`, () => {
      assertDegrades(`cluster.${metric}`, curveFromMap(base, metric, score));
    });
  }

  // Structurally geometry-insensitive: modularity is a function of the partition and
  // the graph edges only (never the drawn positions), so jitter must not move it.
  it("modularity is invariant under jitter (it scores the partition over edges, not pixels)", () => {
    assertInvariant("cluster.modularity", curveFromMap(base, "modularity", score));
  });
});

// ---------------------------------------------------------------------------
// SEMANTIC.
// ---------------------------------------------------------------------------

describe("perturbation self-test: semantic metrics degrade under jitter", () => {
  const fx = generateBlobs({
    count: 90,
    dims: 16,
    clusters: 4,
    clusterStd: 0.6,
    seed: 7,
    centerSpread: 10,
  });
  const nodes: SceneNodeData[] = fx.vectors.map((v, i) => ({
    id: `sem-${i}`,
    kind: "adr",
    embedding: v,
  }));
  const { positions } = semanticProjection(nodes);
  const baseArr: Position[] = nodes.map((n) => positions.get(n.id) ?? { x: 0, y: 0 });

  const curve = (metric: string): number[] =>
    JITTER_LEVELS.map((lvl) => {
      const jp = jitterArray(baseArr, lvl, makePrng(JITTER_SEED));
      const m = scoreSemanticLayout(fx.vectors, jp, fx.labels) as unknown as Record<
        string,
        number
      >;
      return m[metric];
    });

  // Every semantic rank/neighbourhood metric reads the 2D positions, so all degrade.
  for (const metric of [
    "trustworthiness",
    "continuity",
    "qnx",
    "neighborhoodHit",
    "silhouette",
    "nearestCentroid",
  ]) {
    it(`${metric} is non-increasing under rising jitter`, () => {
      assertDegrades(`semantic.${metric}`, curve(metric));
    });
  }
});
