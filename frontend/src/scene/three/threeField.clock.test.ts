import { describe, expect, it } from "vitest";
import { SIM_MAX_CATCHUP_TICKS, SIM_TICK_MS } from "./threeField/config";
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
    expect(clock.consume(60_000)).toBe(SIM_MAX_CATCHUP_TICKS);
    expect(clock.consume(60_000)).toBe(0);
    expect(clock.consume(60_000 + SIM_TICK_MS / 2)).toBe(1);
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
