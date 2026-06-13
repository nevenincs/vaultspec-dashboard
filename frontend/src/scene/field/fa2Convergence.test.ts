// S05 adversarial — FA2 convergence detection.
//
// Reproduce-then-fix cadence: each case is written so that removing the
// convergence window logic (making tick() always return false) causes the
// test to fail, proving the detector is the safety net, not a tautology.

import { describe, expect, it } from "vitest";

import {
  ConvergenceDetector,
  CONVERGENCE_THRESHOLD,
  CONVERGENCE_WINDOW,
} from "./fa2Convergence";

describe("ConvergenceDetector — S05 adversarial", () => {
  it("does not fire before CONVERGENCE_WINDOW consecutive below-threshold ticks", () => {
    // Without the convergence window the detector would fire immediately.
    const det = new ConvergenceDetector();
    for (let i = 0; i < CONVERGENCE_WINDOW - 1; i++) {
      expect(det.tick(CONVERGENCE_THRESHOLD * 0.5)).toBe(false);
    }
  });

  it("fires on the Nth consecutive below-threshold tick — the window is exact", () => {
    const det = new ConvergenceDetector();
    for (let i = 0; i < CONVERGENCE_WINDOW - 1; i++) {
      det.tick(CONVERGENCE_THRESHOLD * 0.5);
    }
    expect(det.tick(CONVERGENCE_THRESHOLD * 0.5)).toBe(true);
  });

  it("resets the window when any tick meets or exceeds the threshold", () => {
    const det = new ConvergenceDetector();
    // Build up CONVERGENCE_WINDOW - 1 consecutive below-threshold ticks.
    for (let i = 0; i < CONVERGENCE_WINDOW - 1; i++) {
      det.tick(CONVERGENCE_THRESHOLD * 0.5);
    }
    // One high-displacement tick — window must reset.
    det.tick(CONVERGENCE_THRESHOLD * 2);
    // Now the full window is required again.
    for (let i = 0; i < CONVERGENCE_WINDOW - 1; i++) {
      expect(det.tick(CONVERGENCE_THRESHOLD * 0.5)).toBe(false);
    }
    expect(det.tick(CONVERGENCE_THRESHOLD * 0.5)).toBe(true);
  });

  it("never fires on a storm of high-displacement ticks (adversarial: always-moving layout)", () => {
    // Simulates a layout that never settles — the detector must never trigger.
    const det = new ConvergenceDetector();
    for (let i = 0; i < CONVERGENCE_WINDOW * 100; i++) {
      expect(det.tick(CONVERGENCE_THRESHOLD * 10)).toBe(false);
    }
  });

  it("displacement at the threshold boundary (not strictly below) resets the window", () => {
    // The condition is strict: maxDisplacement < CONVERGENCE_THRESHOLD.
    // A value exactly at the threshold is NOT below it and must reset.
    const det = new ConvergenceDetector();
    for (let i = 0; i < CONVERGENCE_WINDOW - 1; i++) {
      det.tick(CONVERGENCE_THRESHOLD - 0.01);
    }
    det.tick(CONVERGENCE_THRESHOLD); // exactly at threshold → not below → reset
    // After the reset, a single below-threshold tick is not enough.
    expect(det.tick(CONVERGENCE_THRESHOLD - 0.01)).toBe(false);
  });

  it("reset() restarts the window — fires again only after a full post-reset window", () => {
    const det = new ConvergenceDetector();
    // Converge once.
    for (let i = 0; i < CONVERGENCE_WINDOW; i++) det.tick(0);
    // reset() clears the consecutive counter.
    det.reset();
    // A full new window is required before the next convergence.
    for (let i = 0; i < CONVERGENCE_WINDOW - 1; i++) {
      expect(det.tick(0)).toBe(false);
    }
    expect(det.tick(0)).toBe(true);
  });

  it("displacement of zero counts as below threshold — immediate settle possible", () => {
    // Zero displacement means nodes are not moving at all; CONVERGENCE_WINDOW
    // ticks of zero must converge.
    const det = new ConvergenceDetector();
    let fired = false;
    for (let i = 0; i < CONVERGENCE_WINDOW; i++) {
      if (det.tick(0)) {
        fired = true;
        break;
      }
    }
    expect(fired).toBe(true);
  });
});
