import { describe, expect, it } from "vitest";
import {
  SIM_FRAME_BUDGET_MS,
  SIM_MAX_CATCHUP_TICKS,
  SIM_TICK_MS,
} from "./threeField/config";
import { SimulationClock } from "./threeField/simulationClock";

describe("simulation wall-clock stepping", () => {
  it.each([30, 40, 60, 90, 120, 144])(
    "runs 60 ticks over one second at %i Hz",
    (hz) => {
      const clock = new SimulationClock();
      let ticks = clock.consume(0);
      for (let frame = 1; frame <= hz; frame++) {
        ticks += clock.consume((frame * 1000) / hz);
      }
      expect(ticks).toBe(60);
    },
  );

  it("retains fractional time across frames that do not need a tick", () => {
    const clock = new SimulationClock();
    expect(clock.consume(0)).toBe(0);
    expect(clock.consume(10)).toBe(0);
    expect(clock.consume(20)).toBe(1);
    expect(clock.consume(30)).toBe(0);
    expect(clock.consume(40)).toBe(1);
    expect(clock.consume(50)).toBe(1);
  });

  it("bounds stall catch-up without carrying a backlog into later frames", () => {
    const clock = new SimulationClock();
    clock.consume(0);
    clock.consume(SIM_TICK_MS / 2);
    expect(clock.consume(60_000 + SIM_TICK_MS / 2)).toBe(SIM_MAX_CATCHUP_TICKS);
    expect(clock.stats.discardedTicks).toBe(3600 - SIM_MAX_CATCHUP_TICKS);
    expect(clock.consume(60_000 + SIM_TICK_MS / 2)).toBe(0);
    expect(clock.consume(60_000 + SIM_TICK_MS)).toBe(1);
  });

  it("discards both idle time and the old fraction after a pause", () => {
    const clock = new SimulationClock();
    clock.consume(0);
    clock.consume(10);
    clock.reset();
    expect(clock.consume(60_000)).toBe(0);
    expect(clock.consume(60_010)).toBe(0);
    expect(clock.consume(60_020)).toBe(1);
  });
});

/** Deterministic measured-cost inputs exercise the real admission/accounting
 *  policy without making tests depend on machine speed or replacing timers. */
function runCostedFrame(clock: SimulationClock, now: number, tickMs: number): number {
  const offered = clock.consume(now);
  let executed = 0;
  let elapsed = 0;
  while (executed < offered && (executed === 0 || clock.canCatchUp(elapsed))) {
    elapsed += tickMs;
    clock.recordTick(tickMs);
    executed++;
  }
  clock.discard(offered - executed);
  return executed;
}

describe("simulation CPU budget", () => {
  it.each([30, 40, 60, 90, 120, 144])(
    "keeps 60 executed steps per second at %i Hz when work fits",
    (hz) => {
      const clock = new SimulationClock();
      runCostedFrame(clock, 0, 1);
      for (let frame = 1; frame <= hz; frame++) {
        runCostedFrame(clock, (frame * 1000) / hz, 1);
      }
      expect(clock.stats.executedTicks).toBe(60);
      expect(clock.stats.discardedTicks).toBe(0);
    },
  );

  it("allows one indivisible expensive step and explicitly discards catch-up debt", () => {
    const clock = new SimulationClock();
    runCostedFrame(clock, 0, 100);
    expect(runCostedFrame(clock, 100, 100)).toBe(1);
    expect(clock.stats).toMatchObject({
      executedTicks: 1,
      discardedTicks: 5,
      frameExecutedTicks: 1,
      frameDiscardedTicks: 5,
      frameSolverMs: 100,
    });
    expect(runCostedFrame(clock, 100, 100)).toBe(0);
    expect(runCostedFrame(clock, 100 + SIM_TICK_MS, 100)).toBe(1);
    expect(clock.stats.discardedTicks).toBe(5);
  });

  it("predicts the next whole tick before admitting it and includes prior callback work", () => {
    const clock = new SimulationClock();
    clock.recordTick(3);
    expect(clock.canCatchUp(SIM_FRAME_BUDGET_MS - 3)).toBe(true);
    expect(clock.canCatchUp(SIM_FRAME_BUDGET_MS - 3 + 0.01)).toBe(false);
    clock.recordTick(12);
    expect(clock.canCatchUp(0)).toBe(false);
    clock.recordTick(1);
    expect(clock.canCatchUp(0)).toBe(false);
    clock.reset();
    clock.recordTick(1);
    expect(clock.canCatchUp(1)).toBe(true);
  });

  it("retains the elapsed fractional step when budget discards whole steps", () => {
    const clock = new SimulationClock();
    runCostedFrame(clock, 0, 12);
    expect(runCostedFrame(clock, 2.5 * SIM_TICK_MS, 12)).toBe(1);
    expect(clock.stats.discardedTicks).toBe(1);
    expect(runCostedFrame(clock, 3 * SIM_TICK_MS, 12)).toBe(1);
    expect(clock.stats.discardedTicks).toBe(1);
  });

  it("resets fractional time and cost prediction without erasing lifetime accounting", () => {
    const clock = new SimulationClock();
    runCostedFrame(clock, 0, 100);
    runCostedFrame(clock, 2.5 * SIM_TICK_MS, 100);
    clock.reset();
    expect(runCostedFrame(clock, 60_000, 1)).toBe(0);
    expect(runCostedFrame(clock, 60_000 + SIM_TICK_MS / 2, 1)).toBe(0);
    expect(runCostedFrame(clock, 60_000 + 2 * SIM_TICK_MS, 1)).toBe(2);
    expect(clock.stats.executedTicks).toBe(3);
    expect(clock.stats.discardedTicks).toBe(1);
  });

  it("saturates lifetime counters without retaining an unbounded history", () => {
    const clock = new SimulationClock();
    clock.stats.executedTicks = Number.MAX_SAFE_INTEGER;
    clock.stats.discardedTicks = Number.MAX_SAFE_INTEGER;
    clock.recordTick(1);
    clock.discard(3);
    expect(clock.stats.executedTicks).toBe(Number.MAX_SAFE_INTEGER);
    expect(clock.stats.discardedTicks).toBe(Number.MAX_SAFE_INTEGER);
  });
});
