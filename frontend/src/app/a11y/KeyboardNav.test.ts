import { describe, expect, it } from "vitest";

import { bracketStep, cycle, steppedPlayhead } from "./KeyboardNav";

describe("cycle (arrow-walk, G7.d)", () => {
  it("cycles forward and backward with wraparound", () => {
    expect(cycle(["a", "b", "c"], "a", 1)).toBe("b");
    expect(cycle(["a", "b", "c"], "c", 1)).toBe("a");
    expect(cycle(["a", "b", "c"], "a", -1)).toBe("c");
  });

  it("starts at the first entry without a current and handles empties", () => {
    expect(cycle(["a", "b"], null, 1)).toBe("a");
    expect(cycle(["a", "b"], "missing", 1)).toBe("a");
    expect(cycle([], null, 1)).toBeNull();
  });
});

describe("bracket-step the playhead (G7.d)", () => {
  const window_ = { from: 0, to: 100 * 60_000 }; // 100 minutes

  it("steps by 2% of the window with a one-minute floor", () => {
    expect(bracketStep(window_.to - window_.from)).toBe(2 * 60_000);
    expect(bracketStep(1000)).toBe(60_000);
  });

  it("steps back from LIVE into time travel and clamps at the window", () => {
    const now = window_.to;
    const back = steppedPlayhead("live", -1, window_, now);
    expect(back).toBe(now - 2 * 60_000);
    expect(steppedPlayhead(window_.from + 1000, -1, window_, now)).toBe(window_.from);
  });

  it("steps forward to LIVE when reaching now", () => {
    const now = window_.to;
    expect(steppedPlayhead(now - 60_000, 1, window_, now)).toBe("live");
    expect(steppedPlayhead(now / 2, 1, window_, now)).toBe(now / 2 + 2 * 60_000);
  });
});
