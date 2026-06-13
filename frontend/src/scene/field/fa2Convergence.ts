// ForceAtlas2 convergence detection (W02.P03.S05).
//
// Extracted as a pure module so it can be unit-tested without running the
// worker. The worker imports and instantiates ConvergenceDetector; tests
// import the class and constants directly.

/** Max per-node displacement (world units) below which a tick is considered settled. */
export const CONVERGENCE_THRESHOLD = 0.5;

/**
 * Number of consecutive below-threshold ticks required before the layout is
 * declared converged and the FA2 worker stops.
 */
export const CONVERGENCE_WINDOW = 10;

/**
 * Detects ForceAtlas2 layout convergence by watching consecutive ticks where
 * the maximum per-node displacement stays below CONVERGENCE_THRESHOLD.
 *
 * Usage:
 *   const det = new ConvergenceDetector();
 *   // In tick(): compute max displacement, then:
 *   if (det.tick(maxDisp)) { running = false; return; }
 *   // On init / start / change / params: det.reset();
 */
export class ConvergenceDetector {
  private consecutive = 0;

  /**
   * Feed the maximum per-node displacement from the last tick.
   * Returns true when the layout has converged (CONVERGENCE_WINDOW
   * consecutive ticks with displacement < CONVERGENCE_THRESHOLD).
   */
  tick(maxDisplacement: number): boolean {
    if (maxDisplacement < CONVERGENCE_THRESHOLD) {
      this.consecutive += 1;
      return this.consecutive >= CONVERGENCE_WINDOW;
    }
    this.consecutive = 0;
    return false;
  }

  /** Reset the convergence window — call on init / start / change / params. */
  reset(): void {
    this.consecutive = 0;
  }
}
