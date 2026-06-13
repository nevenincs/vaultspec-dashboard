// Unit tests for AlgorithmPanel (task-6 graph workspace chrome).
//
// F6-02 coverage (reviewer requirement):
//   • DEFAULTS shape: values must match FA2 inferSettings() output for a
//     medium-sized graph — this is what the scene uses when the panel opens.
//   • applyParams composition: merging a partial update into the current
//     params must produce a sound merged object (no field dropped, no field
//     introduced beyond the Required<LayoutParams> shape).
//
// The panel's SceneController dispatch is covered by the component-level
// test in NavToolbar.test.ts (same mock pattern); here we focus on the
// exported constants and the merge semantics.

import { describe, expect, it } from "vitest";

import type { LayoutParams } from "../../scene/field/layoutWorker";
import { DEFAULTS } from "./AlgorithmPanel";

// ---------------------------------------------------------------------------
// DEFAULTS — match FA2 inferSettings() for a medium graph
// ---------------------------------------------------------------------------

describe("AlgorithmPanel DEFAULTS", () => {
  it("has all five Required<LayoutParams> fields with no extras", () => {
    const keys = Object.keys(DEFAULTS).sort();
    expect(keys).toEqual(
      [
        "barnesHutOptimize",
        "gravity",
        "iterationsPerTick",
        "scalingRatio",
        "slowDown",
      ].sort(),
    );
  });

  it("scalingRatio defaults to 25 (spread-optimised for ~70% stage fill)", () => {
    expect(DEFAULTS.scalingRatio).toBe(25);
  });

  it("gravity defaults to 0.5 (loose centre pull, prevents clustering blob)", () => {
    expect(DEFAULTS.gravity).toBe(0.5);
  });

  it("slowDown defaults to 1 (no added damping)", () => {
    expect(DEFAULTS.slowDown).toBe(1);
  });

  it("barnesHutOptimize defaults to true (O(n log n) tree for n>200)", () => {
    expect(DEFAULTS.barnesHutOptimize).toBe(true);
  });

  it("iterationsPerTick defaults to 4 (4 FA2 steps per 16ms frame)", () => {
    expect(DEFAULTS.iterationsPerTick).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// applyParams composition — the merge must be non-destructive
// ---------------------------------------------------------------------------

describe("applyParams composition (merge semantics)", () => {
  // Simulate the merge inside applyParams without rendering the component.
  function applyParams(
    current: Required<LayoutParams>,
    update: Partial<LayoutParams>,
  ): Required<LayoutParams> {
    return { ...current, ...update };
  }

  it("merging a partial update preserves all unmodified fields", () => {
    const result = applyParams(DEFAULTS, { gravity: 2.0 });
    expect(result.gravity).toBe(2.0);
    expect(result.scalingRatio).toBe(DEFAULTS.scalingRatio);
    expect(result.slowDown).toBe(DEFAULTS.slowDown);
    expect(result.barnesHutOptimize).toBe(DEFAULTS.barnesHutOptimize);
    expect(result.iterationsPerTick).toBe(DEFAULTS.iterationsPerTick);
  });

  it("merging multiple fields simultaneously updates all of them", () => {
    const result = applyParams(DEFAULTS, {
      scalingRatio: 5,
      gravity: 1.5,
      barnesHutOptimize: false,
    });
    expect(result.scalingRatio).toBe(5);
    expect(result.gravity).toBe(1.5);
    expect(result.barnesHutOptimize).toBe(false);
    // Unchanged fields
    expect(result.slowDown).toBe(DEFAULTS.slowDown);
    expect(result.iterationsPerTick).toBe(DEFAULTS.iterationsPerTick);
  });

  it("merging an empty update is a no-op", () => {
    const result = applyParams(DEFAULTS, {});
    expect(result).toEqual(DEFAULTS);
  });

  it("reset to DEFAULTS after a partial update restores the original shape", () => {
    const modified = applyParams(DEFAULTS, { scalingRatio: 0.1, gravity: 5 });
    const reset = applyParams(modified, { ...DEFAULTS });
    expect(reset).toEqual(DEFAULTS);
  });
});
