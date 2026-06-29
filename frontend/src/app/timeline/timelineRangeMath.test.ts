import { describe, expect, it } from "vitest";

import {
  clampToSpan,
  dateLabel,
  dayISO,
  monthTicks,
  msAtRatio,
  nextRangeForHandle,
  parseISO,
  rangeIsNarrowed,
  rangeWritePayload,
  ratioAtClientX,
  spanRatio,
} from "./timelineRangeMath";

const JUN1 = Date.parse("2026-06-01");
const JUN30 = Date.parse("2026-06-30");

describe("timelineRange helpers", () => {
  it("parseISO returns ms or null", () => {
    expect(parseISO("2026-06-01")).toBe(JUN1);
    expect(parseISO(undefined)).toBeNull();
    expect(parseISO("not-a-date")).toBeNull();
  });

  it("dateLabel and dayISO render UTC day forms", () => {
    expect(dateLabel(JUN1)).toBe("1 Jun 2026");
    expect(dayISO(JUN30)).toBe("2026-06-30");
  });

  it("monthTicks lists month starts across the span (bounded)", () => {
    const ticks = monthTicks(Date.parse("2026-04-15"), Date.parse("2026-06-15"));
    expect(ticks).toEqual(["May", "Jun"]);
    expect(monthTicks(JUN30, JUN1)).toEqual([]); // reversed span → none
    expect(monthTicks(0, Date.parse("2030-01-01"), 3)).toHaveLength(3); // capped
  });

  it("spanRatio / msAtRatio are inverse within the span and clamp", () => {
    expect(spanRatio(JUN1, JUN1, JUN30)).toBe(0);
    expect(spanRatio(JUN30, JUN1, JUN30)).toBe(1);
    expect(spanRatio(JUN1 - 1000, JUN1, JUN30)).toBe(0); // clamped low
    const mid = msAtRatio(0.5, JUN1, JUN30);
    expect(spanRatio(mid, JUN1, JUN30)).toBeCloseTo(0.5, 5);
    expect(spanRatio(JUN1, JUN1, JUN1)).toBe(0); // zero span → 0, no div-by-zero
  });

  it("clampToSpan keeps a value inside the corpus span", () => {
    expect(clampToSpan(JUN1 - 5000, JUN1, JUN30)).toBe(JUN1);
    expect(clampToSpan(JUN30 + 5000, JUN1, JUN30)).toBe(JUN30);
    expect(clampToSpan(JUN1 + 10, JUN1, JUN30)).toBe(JUN1 + 10);
  });

  it("ratioAtClientX maps a pointer x over the track rect to 0..1", () => {
    expect(ratioAtClientX(100, 100, 200)).toBe(0);
    expect(ratioAtClientX(300, 100, 200)).toBe(1);
    expect(ratioAtClientX(200, 100, 200)).toBeCloseTo(0.5, 5);
    expect(ratioAtClientX(50, 100, 200)).toBe(0); // left of track → clamped
    expect(ratioAtClientX(0, 0, 0)).toBe(0); // zero width → 0
  });

  it("nextRangeForHandle keeps the handles at least one day apart (never overlap)", () => {
    // dragging the FROM handle past the end pins it one day SHORT of the end, never onto it
    expect(nextRangeForHandle("from", JUN30 + 86_400_000, JUN1, JUN30)).toEqual({
      from: "2026-06-29",
      to: "2026-06-30",
    });
    // dragging the TO handle before the start pins it one day AFTER the start
    expect(nextRangeForHandle("to", JUN1 - 86_400_000, JUN1, JUN30)).toEqual({
      from: "2026-06-01",
      to: "2026-06-02",
    });
    // dragging FROM right up to the end day still leaves the one-day gap
    expect(nextRangeForHandle("from", JUN30, JUN1, JUN30)).toEqual({
      from: "2026-06-29",
      to: "2026-06-30",
    });
    // a normal from-drag inside the span is unaffected (well clear of the end)
    expect(nextRangeForHandle("from", Date.parse("2026-06-10"), JUN1, JUN30)).toEqual({
      from: "2026-06-10",
      to: "2026-06-30",
    });
  });

  it("rangeIsNarrowed only when a dashboard range is inside the corpus", () => {
    expect(rangeIsNarrowed("dashboard", JUN1, JUN30, JUN1, JUN30)).toBe(false); // full span
    expect(
      rangeIsNarrowed("dashboard", Date.parse("2026-06-10"), JUN30, JUN1, JUN30),
    ).toBe(true);
    expect(
      rangeIsNarrowed("fallback", Date.parse("2026-06-10"), JUN30, JUN1, JUN30),
    ).toBe(false); // not a committed dashboard range
  });

  it("rangeWritePayload clears on full coverage, keeps a real narrow (regression)", () => {
    // Full coverage → clear ({}), so widening the timeline fully is reversible and
    // never leaves undated rail/graph docs permanently hidden.
    expect(
      rangeWritePayload({ from: "2026-06-01", to: "2026-06-30" }, JUN1, JUN30),
    ).toEqual({});
    // Beyond the edges still clears.
    expect(
      rangeWritePayload({ from: "2026-05-20", to: "2026-07-10" }, JUN1, JUN30),
    ).toEqual({});
    // A genuine narrow is preserved.
    expect(
      rangeWritePayload({ from: "2026-06-10", to: "2026-06-30" }, JUN1, JUN30),
    ).toEqual({ from: "2026-06-10", to: "2026-06-30" });
    expect(
      rangeWritePayload({ from: "2026-06-01", to: "2026-06-20" }, JUN1, JUN30),
    ).toEqual({ from: "2026-06-01", to: "2026-06-20" });
  });
});
