import { SIM_MAX_CATCHUP_TICKS, SIM_TICK_MS } from "./config";

/** Whole fixed steps with a fractional remainder and bounded stall recovery. */
export class SimulationClock {
  private lastTimestamp: number | null = null;
  private remainderMs = 0;

  reset(): void {
    this.lastTimestamp = null;
    this.remainderMs = 0;
  }

  consume(now: number): number {
    if (this.lastTimestamp === null) {
      this.lastTimestamp = now;
      return 0;
    }
    const elapsed = Math.max(0, now - this.lastTimestamp);
    this.lastTimestamp = now;
    // Drop excess stalled time, retaining the previous fractional step. A slow
    // frame cannot build a backlog that monopolizes every subsequent frame.
    this.remainderMs += Math.min(elapsed, SIM_TICK_MS * SIM_MAX_CATCHUP_TICKS);
    const ticks = Math.floor(this.remainderMs / SIM_TICK_MS + 1e-9);
    this.remainderMs = Math.max(0, this.remainderMs - ticks * SIM_TICK_MS);
    return ticks;
  }
}
