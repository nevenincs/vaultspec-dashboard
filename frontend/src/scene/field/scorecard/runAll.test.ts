// All-six scorecard regression fence (graph-viz-scorecard ADR, W04.P10.S47).
//
// The consolidated CI fence proving ALL SIX layout families (force, semantic,
// lineage, hierarchy, radial, clusters over SBM and LFR) meet quality: it runs the
// run-all entry over the deterministic seeded fixtures and asserts EVERY emitted
// `ScorecardVector` passes — i.e. every per-metric value clears its calibrated
// threshold under the current METRIC_VERSION, and therefore `passed === true` for
// each vector. Per the ADR's section-3 gating law this asserts the per-metric
// thresholds (never an aggregate), so a single metric below its floor fails the
// fence with a named diagnostic.
//
// This is the W04.P10 baseline capture made executable: the gates already pass
// their own thresholds in `scorecard.test.ts`; this suite proves the run-all
// AGGREGATOR collects them faithfully, stays deterministic, and that all six pass
// together as one fence. If a layout FAILS here, that is a real quality finding for
// the W04.P11 hardening phase — do NOT loosen the committed thresholds to force a
// pass.

import { describe, expect, it } from "vitest";

import { METRIC_VERSION } from "./scorecard";
import {
  RUN_ALL_GATES,
  formatScorecard,
  runAllGates,
  runAllGatesKeyed,
  runAllGatesOverSlice,
} from "./runAll";

const EXPECTED_LAYOUTS = [
  "force",
  "semantic",
  "lineage",
  "hierarchy",
  "radial",
  "cluster-sbm",
  "cluster-lfr",
] as const;

describe("runAllGates: every layout's vector is emitted", () => {
  it("runs one vector per gate, keyed by the expected layout names in order", () => {
    const vectors = runAllGates();
    expect(vectors.map((v) => v.layout)).toEqual([...EXPECTED_LAYOUTS]);
    expect(vectors).toHaveLength(RUN_ALL_GATES.length);
  });

  it("echoes the current METRIC_VERSION onto every vector", () => {
    for (const v of runAllGates()) {
      expect(v.metricVersion).toBe(METRIC_VERSION);
    }
  });

  it("is deterministic: two run-all passes produce identical metric values", () => {
    const a = runAllGates();
    const b = runAllGates();
    expect(a.map((v) => v.metrics.map((m) => m.value))).toEqual(
      b.map((v) => v.metrics.map((m) => m.value)),
    );
    expect(a.map((v) => v.seed)).toEqual(b.map((v) => v.seed));
  });

  it("exposes the same vectors keyed by layout", () => {
    const keyed = runAllGatesKeyed();
    expect(Object.keys(keyed)).toEqual([...EXPECTED_LAYOUTS]);
    for (const v of runAllGates()) {
      expect(keyed[v.layout].metrics.map((m) => m.value)).toEqual(
        v.metrics.map((m) => m.value),
      );
    }
  });
});

describe("ALL SIX layouts pass their per-metric thresholds over the fixtures", () => {
  it("every ScorecardVector.passed is true (per-metric, never aggregate)", () => {
    const vectors = runAllGates();
    // Name every failing metric across every layout so a real quality regression
    // reports exactly which floor it breached (the W04.P11 hardening signal).
    const failures: string[] = [];
    for (const v of vectors) {
      for (const m of v.metrics) {
        if (!m.pass) {
          failures.push(
            `${v.layout}.${m.name}: ${m.value.toFixed(3)} < ${m.threshold.toFixed(3)} (margin ${m.margin.toFixed(3)})`,
          );
        }
      }
    }
    expect(
      failures,
      `layout(s) below threshold:\n${failures.join("\n")}\n\n${formatScorecard(vectors)}`,
    ).toEqual([]);

    // And the vector-level verdict is the AND of those per-metric passes.
    for (const v of vectors) {
      expect(v.passed, `${v.layout} passed`).toBe(true);
    }
    // Every layout passed -> the whole fence is green.
    expect(vectors.every((v) => v.passed)).toBe(true);
  });

  it("each metric value is a real [0,1] quality (no NaN, no out-of-range)", () => {
    for (const v of runAllGates()) {
      for (const m of v.metrics) {
        expect(Number.isFinite(m.value)).toBe(true);
        expect(m.value).toBeGreaterThanOrEqual(0);
        expect(m.value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("formatScorecard: renders the per-layout per-metric table", () => {
  it("includes every layout, every metric row, and an all-pass summary", () => {
    const vectors = runAllGates();
    const text = formatScorecard(vectors);

    expect(text).toContain("LAYOUT-QUALITY SCORECARD");
    for (const layout of EXPECTED_LAYOUTS) {
      expect(text).toContain(layout);
    }
    // Every metric name appears as a row.
    for (const v of vectors) {
      for (const m of v.metrics) {
        expect(text).toContain(m.name);
      }
    }
    // All six pass -> the summary reads ALL PASS with the right tally.
    expect(text).toContain(
      `SUMMARY: ${vectors.length}/${vectors.length} layouts passed`,
    );
    expect(text).toContain("ALL PASS");
    // No FAIL verdict marker leaks into an all-green table.
    expect(text).not.toContain("[FAIL]");
  });

  it("is deterministic given a deterministic vector list", () => {
    expect(formatScorecard(runAllGates())).toBe(formatScorecard(runAllGates()));
  });
});

describe("runAllGatesOverSlice: W06 live-slice seam (stubbed in W04.P10)", () => {
  it("returns no vectors in this phase and tolerates an empty slice", () => {
    expect(runAllGatesOverSlice([], [])).toEqual([]);
  });

  it("accepts a node_id-keyed embeddings map without throwing (seam shape)", () => {
    const nodes = [
      { id: "n0", kind: "adr", featureTags: ["alpha"], embedding: [1, 0, 0] },
      { id: "n1", kind: "adr", featureTags: ["beta"], embedding: [0, 1, 0] },
    ];
    const embeddings = new Map<string, readonly number[]>([
      ["n0", [1, 0, 0]],
      ["n1", [0, 1, 0]],
    ]);
    expect(runAllGatesOverSlice(nodes, [], embeddings)).toEqual([]);
  });
});
