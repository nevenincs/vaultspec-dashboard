// Calibration-script smoke test (graph-viz-scorecard ADR, W01.P04.S24).
//
// Two properties the calibration-vs-gate split depends on (ADR section 4):
//   1. The sweep is DETERMINISTIC: two runs of `calibrateAll` produce byte-identical
//      output. Calibration that drifted run-to-run could not produce a committable
//      baseline; the seeded mulberry32 fixtures + bounded scorers make it stable.
//   2. The COMMITTED thresholds in `thresholds.ts` REPRODUCE from the sweep: every
//      committed floor equals the freshly-swept floor (to the 2-decimal rounding the
//      committed literals use), so the constants in `thresholds.ts` are demonstrably
//      the output of `calibrate.ts`, not hand-tuned numbers that drifted away from it.
//      This is what makes "committed calibration output, never auto-recalibrated by
//      the gate" an enforced contract rather than a comment.
//
// The smoke test does NOT run inside any gate (the gate never calibrates - ADR
// "Pitfalls to avoid"); it is a standalone vitest that fences the calibration tool
// and the committed baseline against each other.

import { describe, expect, it } from "vitest";

import { CALIBRATION_MARGIN, calibrateAll } from "./calibrate";
import {
  CLUSTER_LFR_THRESHOLDS,
  CLUSTER_SBM_THRESHOLDS,
  FORCE_THRESHOLDS,
  HIERARCHY_THRESHOLDS,
  LINEAGE_THRESHOLDS,
  RADIAL_THRESHOLDS,
  SEMANTIC_THRESHOLDS,
  type ThresholdSet,
} from "./thresholds";

/** The committed threshold set per calibration layout name. */
const COMMITTED: Record<string, ThresholdSet> = {
  force: FORCE_THRESHOLDS,
  lineage: LINEAGE_THRESHOLDS,
  hierarchy: HIERARCHY_THRESHOLDS,
  radial: RADIAL_THRESHOLDS,
  "cluster-sbm": CLUSTER_SBM_THRESHOLDS,
  "cluster-lfr": CLUSTER_LFR_THRESHOLDS,
  semantic: SEMANTIC_THRESHOLDS,
};

describe("calibration sweep determinism", () => {
  it("produces byte-identical output across two runs", () => {
    const a = calibrateAll();
    const b = calibrateAll();
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("re-runs each layout's per-metric floors identically", () => {
    const a = calibrateAll();
    const b = calibrateAll();
    expect(a.layouts.length).toBe(b.layouts.length);
    for (let i = 0; i < a.layouts.length; i++) {
      expect(a.layouts[i].layout).toBe(b.layouts[i].layout);
      expect(a.layouts[i].thresholds).toEqual(b.layouts[i].thresholds);
      // The observed distribution (min/mean/max) is also stable, not just the floor.
      expect(a.layouts[i].metrics).toEqual(b.layouts[i].metrics);
    }
  });
});

describe("committed thresholds reproduce from the sweep", () => {
  const out = calibrateAll();

  it("covers every shipping layout", () => {
    const swept = new Set(out.layouts.map((l) => l.layout));
    for (const name of Object.keys(COMMITTED)) {
      expect(swept.has(name), `sweep missing layout ${name}`).toBe(true);
    }
  });

  // The committed literals are the swept floors rounded to 2 decimals; assert each
  // committed value reproduces the freshly-swept floor to within that rounding (half a
  // hundredth) - i.e. the committed constants ARE the calibration output.
  for (const layout of [
    "force",
    "lineage",
    "hierarchy",
    "radial",
    "cluster-sbm",
    "cluster-lfr",
    "semantic",
  ]) {
    it(`${layout} committed thresholds equal the swept floors (2dp)`, () => {
      const swept = calibrateAll().layouts.find((l) => l.layout === layout)!;
      const committed = COMMITTED[layout];
      // Same metric set.
      expect(new Set(Object.keys(committed))).toEqual(
        new Set(swept.metrics.map((m) => m.name)),
      );
      for (const m of swept.metrics) {
        expect(
          Math.abs(committed[m.name] - m.floor),
          `${layout}.${m.name}: committed ${committed[m.name]} vs swept floor ` +
            `${m.floor.toFixed(4)}`,
        ).toBeLessThanOrEqual(0.005 + 1e-9);
      }
    });
  }

  it("each committed floor is the swept worst-observed minus the margin (current-good-minus-margin)", () => {
    for (const layout of out.layouts) {
      for (const m of layout.metrics) {
        // floor == clamp(min - margin): reconstruct and compare to the recorded floor.
        const expectedFloor = Math.max(0, Math.min(1, m.min - CALIBRATION_MARGIN));
        expect(
          Math.abs(m.floor - expectedFloor),
          `${layout.layout}.${m.name}: floor ${m.floor} != min(${m.min}) - margin(${CALIBRATION_MARGIN})`,
        ).toBeLessThanOrEqual(1e-9);
      }
    }
  });
});
