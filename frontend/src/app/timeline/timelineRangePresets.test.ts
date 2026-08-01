import { describe, expect, it } from "vitest";

import {
  TIMELINE_RANGE_PRESETS,
  timelineRangeForPreset,
  timelineRangePreset,
  timelineRangePresetForRange,
} from "./timelineRangePresets";

// The named temporal windows the filter flyout offers over the ONE canonical
// date_range. They exist so a preset picked in the flyout and a range dragged on
// the timeline are the SAME record — these tests pin the round trip.

const NOW = Date.parse("2026-08-01T12:34:56Z");

describe("timeline range presets", () => {
  it("keeps the raw vocabulary and order stable", () => {
    expect(TIMELINE_RANGE_PRESETS).toEqual(["any", "7d", "30d", "year", "custom"]);
    expect(Object.isFrozen(TIMELINE_RANGE_PRESETS)).toBe(true);
    expect(timelineRangePreset("30d")).toBe("30d");
    expect(timelineRangePreset(" 30d ")).toBeNull();
    expect(timelineRangePreset("last-week")).toBeNull();
    expect(timelineRangePreset(null)).toBeNull();
  });

  it("resolves each rolling window inclusive of today, in the day-precision wire form", () => {
    expect(timelineRangeForPreset("7d", NOW)).toEqual({
      from: "2026-07-26",
      to: "2026-08-01",
    });
    expect(timelineRangeForPreset("30d", NOW)).toEqual({
      from: "2026-07-03",
      to: "2026-08-01",
    });
    expect(timelineRangeForPreset("year", NOW)).toEqual({
      from: "2026-01-01",
      to: "2026-08-01",
    });
  });

  it("names no window for the two identities that carry none", () => {
    // `any` CLEARS the range rather than writing an explicit full span (an explicit
    // span would permanently hide undated documents); `custom` carries whatever the
    // two date inputs hold.
    expect(timelineRangeForPreset("any", NOW)).toBeNull();
    expect(timelineRangeForPreset("custom", NOW)).toBeNull();
    expect(timelineRangeForPreset("7d", Number.NaN)).toBeNull();
  });

  it("reflects a committed range back as the window it is", () => {
    expect(timelineRangePresetForRange(undefined, NOW)).toBe("any");
    expect(timelineRangePresetForRange({}, NOW)).toBe("any");
    expect(
      timelineRangePresetForRange({ from: "2026-07-26", to: "2026-08-01" }, NOW),
    ).toBe("7d");
    expect(
      timelineRangePresetForRange({ from: "2026-01-01", to: "2026-08-01" }, NOW),
    ).toBe("year");
    // Anything a hand-dragged handle produced is Custom — the reflection half of the
    // two-way sync between the timeline and the flyout.
    expect(
      timelineRangePresetForRange({ from: "2026-03-04", to: "2026-05-06" }, NOW),
    ).toBe("custom");
    // A half-open range is still a real narrowing, so it is never "Any time".
    expect(timelineRangePresetForRange({ from: "2026-03-04" }, NOW)).toBe("custom");
  });
});
