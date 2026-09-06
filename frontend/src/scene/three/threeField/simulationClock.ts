import { SIM_FRAME_BUDGET_MS, SIM_MAX_CATCHUP_TICKS, SIM_TICK_MS } from "./config";

/** Whole fixed steps with a fractional remainder and bounded stall recovery. */
export class SimulationClock {
  private lastTimestamp: number | null = null;
  private remainderMs = 0;
  private tickCostMs = 0;

  // Fixed-size diagnostics; lifetime counters saturate rather than lose integer
  // precision. They count physical work, never pretend dropped time was simulated.
  readonly stats = {
    executedTicks: 0,
    discardedTicks: 0,
    frameExecutedTicks: 0,
    frameDiscardedTicks: 0,
    frameSolverMs: 0,
    lastTickMs: 0,
  };

  reset(): void {
    this.lastTimestamp = null;
    this.remainderMs = 0;
    this.tickCostMs = 0;
  }

  consume(now: number): number {
    this.stats.frameExecutedTicks = 0;
    this.stats.frameDiscardedTicks = 0;
    this.stats.frameSolverMs = 0;
    if (this.lastTimestamp === null) {
      this.lastTimestamp = now;
      return 0;
    }
    const elapsed = Math.max(0, now - this.lastTimestamp);
    this.lastTimestamp = now;
    this.remainderMs += elapsed;
    const due = Math.floor(this.remainderMs / SIM_TICK_MS + 1e-9);
    this.remainderMs = Math.max(0, this.remainderMs - due * SIM_TICK_MS);
    const offered = Math.min(due, SIM_MAX_CATCHUP_TICKS);
    this.discard(due - offered);
    return offered;
  }

  /** The first due tick is mandatory; this admits only EXTRA complete ticks. */
  canCatchUp(elapsedMs: number): boolean {
    return elapsedMs + this.tickCostMs <= SIM_FRAME_BUDGET_MS;
  }

  recordTick(durationMs: number): void {
    this.stats.lastTickMs = durationMs;
    // The latest tick immediately raises the prediction, but a cheaper active
    // region lowers it gradually. Reset discards stale predictions after pauses.
    this.tickCostMs = Math.max(durationMs, this.tickCostMs * 0.8);
    this.stats.frameSolverMs += durationMs;
    this.stats.frameExecutedTicks++;
    this.stats.executedTicks = Math.min(
      Number.MAX_SAFE_INTEGER,
      this.stats.executedTicks + 1,
    );
  }

  /** Account for offered steps rejected by CPU budget or early convergence. */
  discard(ticks: number): void {
    this.stats.frameDiscardedTicks += ticks;
    this.stats.discardedTicks = Math.min(
      Number.MAX_SAFE_INTEGER,
      this.stats.discardedTicks + ticks,
    );
  }
}
