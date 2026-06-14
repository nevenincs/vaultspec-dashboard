// The status-stamp mark families through the 14px grayscale-by-shape gate
// (iconography ADR a11y contract; node-visual-richness prototype). The two
// authored families — the severity gauge and the tier staircase — must each be
// mutually distinct in pure grayscale at the legibility floor by SHAPE alone,
// and must not collide with any existing mark in the texture-able set. The gate
// rasterizer is pure (`svgRaster.ts` — no Pixi, no DOM), so this runs in the
// default node env, matching `markGate.test.ts`.

import { describe, expect, it } from "vitest";

import { gateFamily, silhouetteDistance, silhouetteOf } from "./markGate";
import {
  STATE_MARK_DEFS,
  STATUS_MARK_DEFS,
  STATUS_SEVERITY_MARK_DEFS,
  STATUS_TIER_MARK_DEFS,
  TEXTURABLE_MARK_DEFS,
} from "./marks";

// The same squint floor `markGate.test.ts` uses: a minimum admissible Hamming
// distance of 8 over the 196-cell 14×14 silhouette grid.
const GATE_FLOOR = 8;

describe("the status-severity family passes the 14px grayscale gate", () => {
  const defs = Object.values(STATUS_SEVERITY_MARK_DEFS);

  it("the four severity levels are mutually distinct in grayscale at 14px", () => {
    const result = gateFamily(defs, GATE_FLOOR);
    expect(result.pass).toBe(true);
    // Surface the weakest pair so a future tweak that erodes the ladder is named.
    expect(result.minDistance).toBeGreaterThanOrEqual(GATE_FLOOR);
  });

  it("the gauge grows monotonically — each level inks more than the last", () => {
    const cov = defs.map((d) => silhouetteOf(d).coverage);
    for (let i = 1; i < cov.length; i++) {
      expect(cov[i]).toBeGreaterThan(cov[i - 1]);
    }
  });

  it("no severity level collides with state:active (the solid disc) — a hollow gauge, not a filled dot", () => {
    // The decisive cross-family guard: a filled/growing disc would rasterize
    // identically to state:active at 14px. The gauge keeps its center empty, so
    // every level stays well clear of the solid disc.
    const disc = silhouetteOf(STATE_MARK_DEFS.active);
    for (const d of defs) {
      expect(silhouetteDistance(silhouetteOf(d), disc)).toBeGreaterThanOrEqual(
        GATE_FLOOR,
      );
    }
  });
});

describe("the status-tier family passes the 14px grayscale gate", () => {
  const defs = Object.values(STATUS_TIER_MARK_DEFS);

  it("the four tier notches are mutually distinct in grayscale at 14px", () => {
    const result = gateFamily(defs, GATE_FLOOR);
    expect(result.pass).toBe(true);
    expect(result.minDistance).toBeGreaterThanOrEqual(GATE_FLOOR);
  });

  it("the staircase grows monotonically — each step inks a new column", () => {
    const cov = defs.map((d) => silhouetteOf(d).coverage);
    for (let i = 1; i < cov.length; i++) {
      expect(cov[i]).toBeGreaterThan(cov[i - 1]);
    }
  });
});

describe("the whole status-stamp set passes the gate, within and across families", () => {
  it("every status mark is mutually distinct at 14px (severity vs tier vs each other)", () => {
    const result = gateFamily(STATUS_MARK_DEFS, GATE_FLOOR);
    expect(result.pass).toBe(true);
    expect(result.minDistance).toBeGreaterThanOrEqual(GATE_FLOOR);
  });

  it("adding the status families keeps the CROSS-FAMILY texture-able gate green", () => {
    // The status marks are registered into ALL_MARK_DEFS → TEXTURABLE_MARK_DEFS,
    // so the cross-family safety net must still clear the floor with them in it
    // (no status mark collides with any doc-type, event, tier, or state mark).
    const result = gateFamily(TEXTURABLE_MARK_DEFS, GATE_FLOOR);
    expect(result.pass).toBe(true);
    expect(result.minDistance).toBeGreaterThanOrEqual(GATE_FLOOR);
  });
});
