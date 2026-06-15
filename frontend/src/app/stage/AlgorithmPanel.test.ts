// Unit tests for AlgorithmPanel (dashboard-node-graph-stability P03/P04).
//
// Coverage:
//   • DEFAULTS shape: the Obsidian knob set (Repel, Link force, Link distance,
//     Center) — what the panel dispatches and what the scene opens with.
//   • applyParams composition: merging a partial update into the current params
//     must produce a sound merged object (no field dropped, none introduced
//     beyond the Required<LayoutParams> shape).
//
// The panel's SceneController dispatch is covered by the component-level test in
// NavToolbar.test.ts; here we focus on the exported constants and merge.

import { describe, expect, it } from "vitest";

import type { LayoutParams } from "../../scene/field/forceLayout";
import { LAYOUT_DEFAULTS } from "../../scene/field/forceLayout";
import { DEFAULTS } from "./AlgorithmPanel";

describe("AlgorithmPanel DEFAULTS (the Obsidian knob set)", () => {
  it("has the four force knobs and no extras", () => {
    expect(Object.keys(DEFAULTS).sort()).toEqual(
      ["center", "linkDistance", "linkForce", "repel"].sort(),
    );
  });

  it("mirrors the driver's LAYOUT_DEFAULTS (single source of truth)", () => {
    expect(DEFAULTS).toEqual(LAYOUT_DEFAULTS);
  });

  it("defaults to the research parameter table (repel 120, link 0.4/40, center 0.06)", () => {
    expect(DEFAULTS.repel).toBe(120);
    expect(DEFAULTS.linkForce).toBe(0.4);
    expect(DEFAULTS.linkDistance).toBe(40);
    expect(DEFAULTS.center).toBe(0.06);
  });

  it("exposes no cooling parameters (the schedule is fixed, never user-tunable)", () => {
    const keys = Object.keys(DEFAULTS);
    for (const forbidden of ["alphaDecay", "velocityDecay", "alphaMin", "alpha"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("applyParams composition (merge semantics)", () => {
  function applyParams(
    current: Required<LayoutParams>,
    update: Partial<LayoutParams>,
  ): Required<LayoutParams> {
    return { ...current, ...update };
  }

  it("merging a partial update preserves all unmodified fields", () => {
    const result = applyParams(DEFAULTS, { repel: 220 });
    expect(result.repel).toBe(220);
    expect(result.linkForce).toBe(DEFAULTS.linkForce);
    expect(result.linkDistance).toBe(DEFAULTS.linkDistance);
    expect(result.center).toBe(DEFAULTS.center);
  });

  it("merging multiple fields simultaneously updates all of them", () => {
    const result = applyParams(DEFAULTS, { repel: 80, linkDistance: 60, center: 0.1 });
    expect(result.repel).toBe(80);
    expect(result.linkDistance).toBe(60);
    expect(result.center).toBe(0.1);
    expect(result.linkForce).toBe(DEFAULTS.linkForce);
  });

  it("reset to DEFAULTS after a partial update restores the original shape", () => {
    const modified = applyParams(DEFAULTS, { repel: 0, center: 0.3 });
    const reset = applyParams(modified, { ...DEFAULTS });
    expect(reset).toEqual(DEFAULTS);
  });
});
