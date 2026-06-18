// Scorecard gate-family contract tests (graph-viz-scorecard ADR, W01.P03.S20).
//
// The load-bearing assertions this suite pins:
//   1. Every gate emits a ScorecardVector that gates on INDIVIDUAL per-metric
//      thresholds: each metric carries its own value/threshold/margin/pass, and
//      `passed` is the AND of those per-metric passes.
//   2. `passed` is NEVER a mean/aggregate: a vector with one metric forced below
//      its threshold flips `passed` false even when the mean of the metrics is
//      comfortably high (the aggregate would still "look fine").
//   3. METRIC_VERSION is pinned by a regression assertion — a metric-definition
//      change is a contract event that must bump it deliberately.
//   4. Every real gate runs deterministically over its fixed-seed fixture and
//      passes its provisional thresholds (the gate is green on its own fixture).
//
// These are the ADR section-3 gating law made executable: CI gates on the metric
// thresholds, never on the aggregate.

import { describe, expect, it } from "vitest";

import {
  METRIC_VERSION,
  type MetricResult,
  type ScorecardVector,
  buildScorecard,
  evaluate,
} from "./scorecard";
import { runHierarchyGate } from "../hierarchyGate";
import { runLineageGate } from "../lineageGate";
import { runRadialGate } from "../radialGate";
import { runClusterLfrGate, runClusterSbmGate } from "../clusterGate";
import { runSemanticScorecardGate } from "../semanticGate";

/** Mean of the metric values — the report-only aggregate that must NEVER gate. */
function meanValue(metrics: readonly MetricResult[]): number {
  if (metrics.length === 0) return 1;
  return metrics.reduce((s, m) => s + m.value, 0) / metrics.length;
}

/** Assert the vector's `passed` is exactly the AND of its per-metric passes. */
function assertPassedIsConjunction(v: ScorecardVector): void {
  const conjunction = v.metrics.every((m) => m.pass);
  expect(v.passed).toBe(conjunction);
  // And each metric's pass/margin are internally consistent.
  for (const m of v.metrics) {
    expect(m.pass).toBe(m.value >= m.threshold);
    expect(m.margin).toBeCloseTo(m.value - m.threshold, 10);
  }
}

const GATES: { name: string; run: () => ScorecardVector }[] = [
  { name: "lineage", run: runLineageGate },
  { name: "hierarchy", run: runHierarchyGate },
  { name: "radial", run: runRadialGate },
  { name: "cluster-sbm", run: runClusterSbmGate },
  { name: "cluster-lfr", run: runClusterLfrGate },
  { name: "semantic", run: runSemanticScorecardGate },
];

describe("METRIC_VERSION contract", () => {
  it("is pinned at 1 (a metric-definition change must bump it deliberately)", () => {
    expect(METRIC_VERSION).toBe(1);
  });

  it("is echoed onto every gate's vector", () => {
    for (const g of GATES) {
      expect(g.run().metricVersion).toBe(METRIC_VERSION);
    }
  });
});

describe("evaluate: per-metric threshold gating", () => {
  it("computes value/threshold/margin/pass per metric", () => {
    const results = evaluate({ a: 0.9, b: 0.4, c: 0.75 }, { a: 0.8, b: 0.5, c: 0.75 });
    expect(results).toEqual([
      {
        name: "a",
        value: 0.9,
        threshold: 0.8,
        margin: expect.closeTo(0.1, 10),
        pass: true,
      },
      {
        name: "b",
        value: 0.4,
        threshold: 0.5,
        margin: expect.closeTo(-0.1, 10),
        pass: false,
      },
      { name: "c", value: 0.75, threshold: 0.75, margin: 0, pass: true },
    ]);
  });

  it("treats a NaN metric value as 0 (a degenerate drawing fails, never passes)", () => {
    const [r] = evaluate({ a: Number.NaN }, { a: 0.1 });
    expect(r.value).toBe(0);
    expect(r.pass).toBe(false);
  });

  it("gates an unthresholded metric against 0 (reported, not failed)", () => {
    const [r] = evaluate({ a: 0.01 }, {});
    expect(r.threshold).toBe(0);
    expect(r.pass).toBe(true);
  });
});

describe("passed is the AND of per-metric passes, never an aggregate", () => {
  it("a single metric below threshold flips passed false while the mean stays high", () => {
    // Five metrics at 0.95 and one at 0.10 vs a 0.5 threshold: the mean is ~0.81
    // (an aggregate gate would PASS), but the one failing metric must fail the
    // whole vector.
    const values = { a: 0.95, b: 0.95, c: 0.95, d: 0.95, e: 0.95, f: 0.1 };
    const thresholds = { a: 0.5, b: 0.5, c: 0.5, d: 0.5, e: 0.5, f: 0.5 };
    const metrics = evaluate(values, thresholds);
    const v = buildScorecard("synthetic", metrics, 0);

    // The aggregate (mean) would look fine...
    expect(meanValue(v.metrics)).toBeGreaterThan(0.75);
    // ...but the per-metric AND fails because metric f is below its threshold.
    expect(v.passed).toBe(false);
    expect(v.metrics.find((m) => m.name === "f")!.pass).toBe(false);
    expect(v.metrics.filter((m) => m.pass)).toHaveLength(5);
  });

  it("passes only when EVERY metric meets its threshold", () => {
    const metrics = evaluate({ a: 0.6, b: 0.6, c: 0.6 }, { a: 0.5, b: 0.5, c: 0.5 });
    expect(buildScorecard("synthetic", metrics, 0).passed).toBe(true);
  });

  it("an empty metric list is vacuously passed", () => {
    expect(buildScorecard("synthetic", [], 0).passed).toBe(true);
  });
});

describe("real gates emit per-metric-gated vectors deterministically", () => {
  for (const g of GATES) {
    it(`${g.name} gate emits a conjunction-gated, reproducible vector`, () => {
      const a = g.run();
      const b = g.run();

      // Deterministic: two runs produce identical metric values.
      expect(a.metrics.map((m) => m.value)).toEqual(b.metrics.map((m) => m.value));
      expect(a.seed).toBe(b.seed);

      // Structurally a scorecard vector that gates per-metric.
      expect(a.metrics.length).toBeGreaterThan(0);
      assertPassedIsConjunction(a);

      // Every metric value is a real [0,1] quality.
      for (const m of a.metrics) {
        expect(m.value).toBeGreaterThanOrEqual(0);
        expect(m.value).toBeLessThanOrEqual(1);
      }
    });
  }

  it("every real gate passes its provisional thresholds on its own fixture", () => {
    for (const g of GATES) {
      const v = g.run();
      const failing = v.metrics.filter((m) => !m.pass).map((m) => m.name);
      expect(failing, `${g.name} failing metrics: ${failing.join(", ")}`).toEqual([]);
      expect(v.passed).toBe(true);
    }
  });
});

describe("a degraded layout flips the real gate's passed false", () => {
  it("re-evaluating real gate metrics against a near-1 threshold fails", () => {
    // Take a REAL gate's measured metric values and re-gate them against an
    // impossibly high threshold on one metric: the same values that passed now fail,
    // proving the gate gates per-metric and not on an aggregate of the same values.
    const real = GATES[0].run();
    const values: Record<string, number> = {};
    for (const m of real.metrics) values[m.name] = m.value;
    // Force ONE metric's threshold above its value; leave the rest passing.
    const target = real.metrics[0].name;
    const thresholds: Record<string, number> = {};
    for (const m of real.metrics) thresholds[m.name] = 0; // all pass
    thresholds[target] = 1.0001; // impossible -> this one fails
    const regated = buildScorecard(
      real.layout,
      evaluate(values, thresholds),
      real.seed,
    );
    expect(regated.passed).toBe(false);
    expect(regated.metrics.find((m) => m.name === target)!.pass).toBe(false);
    // The mean is unchanged and high; only the per-metric gate caught it.
    expect(meanValue(regated.metrics)).toBeCloseTo(meanValue(real.metrics), 10);
  });
});
