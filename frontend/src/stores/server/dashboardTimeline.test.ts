import { describe, expect, it } from "vitest";

import { dashboardTimelineModeForPlayhead } from "./dashboardTimeline";

describe("dashboardTimelineModeForPlayhead", () => {
  it("uploads time-travel playheads as integer millisecond timestamps", () => {
    expect(dashboardTimelineModeForPlayhead(1_781_494_454_003.5)).toEqual({
      kind: "time-travel",
      at: 1_781_494_454_004,
    });
  });

  it("rejects non-finite playheads before they reach the engine", () => {
    expect(() => dashboardTimelineModeForPlayhead(Number.NaN)).toThrow(
      "dashboard playhead must be a finite millisecond timestamp",
    );
  });
});
