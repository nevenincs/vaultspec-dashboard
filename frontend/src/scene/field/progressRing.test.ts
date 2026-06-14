// The parametric progress-ring primitive (S36). The arc geometry is pure and
// unit-tested here; the Pixi draw is exercised under happy-dom (the geometry is
// the part the ADR specifies — exact done/total arc fills — not the GPU upload).

import { describe, expect, it } from "vitest";

import { RING_START_ANGLE, progressFraction, ringArc } from "./progressRing";

describe("progressFraction", () => {
  it("returns the clamped done/total fraction", () => {
    expect(progressFraction(7, 12)).toBeCloseTo(7 / 12);
    expect(progressFraction(5, 4)).toBe(1); // over-complete clamps to full
    expect(progressFraction(-1, 4)).toBe(0); // negative clamps to empty
  });

  it("is ringless for a non-positive or non-finite total", () => {
    expect(progressFraction(3, 0)).toBeNull();
    expect(progressFraction(3, -2)).toBeNull();
    expect(progressFraction(Number.NaN, 4)).toBeNull();
    expect(progressFraction(3, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("ringArc", () => {
  it("anchors the start at 12 o'clock", () => {
    expect(ringArc(0.5).startAngle).toBe(RING_START_ANGLE);
  });

  it("sweeps the exact fraction of a full turn clockwise", () => {
    expect(ringArc(0).sweep).toBe(0);
    expect(ringArc(0.25).sweep).toBeCloseTo(Math.PI / 2);
    expect(ringArc(0.5).sweep).toBeCloseTo(Math.PI);
    expect(ringArc(1).sweep).toBeCloseTo(2 * Math.PI);
  });

  it("ends a quarter-progress arc at 3 o'clock", () => {
    // start -π/2 (12 o'clock) + π/2 sweep = 0 rad (3 o'clock, y-down canvas).
    expect(ringArc(0.25).endAngle).toBeCloseTo(0);
  });

  it("clamps out-of-range fractions to a single revolution", () => {
    expect(ringArc(2).sweep).toBeCloseTo(2 * Math.PI);
    expect(ringArc(-1).sweep).toBe(0);
  });
});
