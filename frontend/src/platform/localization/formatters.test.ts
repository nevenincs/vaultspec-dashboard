import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatDate,
  formatDuration,
  formatList,
  formatNumber,
  formatPercentage,
  formatRelativeTime,
} from "./formatters";

describe("locale-explicit formatters", () => {
  it("formats numbers, dates, relative time, lists, and percentages by locale", () => {
    expect(formatNumber("en", 1_234.5)).toBe("1,234.5");
    expect(formatNumber("de", 1_234.5)).toBe("1.234,5");

    const timestamp = Date.UTC(2024, 0, 2, 12);
    const dateOptions = {
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
      year: "numeric",
    } as const;
    expect(formatDate("en", timestamp, dateOptions)).toBe("01/02/2024");
    expect(formatDate("de", timestamp, dateOptions)).toBe("02.01.2024");

    expect(formatRelativeTime("en", -1, "day", { numeric: "auto" })).toBe("yesterday");
    expect(formatRelativeTime("fr", -1, "day", { numeric: "auto" })).toBe("hier");
    expect(formatList("en", ["Plan", "Build", "Review"])).toBe(
      "Plan, Build, and Review",
    );
    expect(formatList("fr", ["Plan", "Build", "Review"])).toBe("Plan, Build et Review");
    expect(formatPercentage("en", 0.125, { maximumFractionDigits: 1 })).toBe("12.5%");
  });

  it("formats duration and byte units with their documented input semantics", () => {
    expect(formatDuration("en", 3_660_000, { maxUnits: 2, style: "long" })).toBe(
      "1 hour, 1 minute",
    );
    expect(formatDuration("en", 0, { style: "long" })).toBe("0 seconds");
    expect(formatBytes("en", 1_536, { maximumFractionDigits: 1 })).toBe("1.5 kB");
    expect(formatBytes("en", 1_024 ** 5, { unitDisplay: "long" })).toBe("1 petabyte");
  });

  it("rejects invalid and over-limit inputs without producing display copy", () => {
    expect(formatNumber("not a locale", 1)).toBeNull();
    expect(formatNumber("en", Number.NaN)).toBeNull();
    expect(formatDate("en", new Date(Number.NaN))).toBeNull();
    expect(formatRelativeTime("en", 1, "days" as "day")).toBeNull();
    expect(formatList("en", [])).toBeNull();
    expect(
      formatList(
        "en",
        Array.from({ length: 101 }, () => "item"),
      ),
    ).toBeNull();
    expect(formatList("en", ["x".repeat(4_097)])).toBeNull();
    expect(formatPercentage("en", 0.5, { style: "decimal" } as never)).toBeNull();
    expect(formatDuration("en", -1)).toBeNull();
    expect(formatDuration("en", 1_000, { maxUnits: 6 } as never)).toBeNull();
    expect(formatBytes("en", -1)).toBeNull();
  });

  it("remains stable after bounded formatter-cache churn", () => {
    const before = formatNumber("en", 12.5, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 1,
    });

    for (let minimum = 0; minimum <= 20; minimum += 1) {
      for (let maximum = minimum; maximum <= 20; maximum += 1) {
        expect(
          formatNumber("en", 12.5, {
            maximumFractionDigits: maximum,
            minimumFractionDigits: minimum,
          }),
        ).not.toBeNull();
      }
    }

    expect(
      formatNumber("en", 12.5, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 1,
      }),
    ).toBe(before);
  });
});
