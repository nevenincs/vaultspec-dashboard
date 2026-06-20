import { describe, expect, it } from "vitest";

import { freshnessLabel, isFresh } from "./freshness";

describe("freshness presentation", () => {
  it("labels freshness in compact buckets and cools to silence", () => {
    const now = Date.parse("2026-06-12T12:00:00Z");
    expect(freshnessLabel("2026-06-12T11:30:00Z", now)).toBe("now");
    expect(freshnessLabel("2026-06-12T03:00:00Z", now)).toBe("9h");
    expect(freshnessLabel("2026-06-09T12:00:00Z", now)).toBe("3d");
    expect(freshnessLabel("2026-05-30T12:00:00Z", now)).toBe("1w");
    expect(freshnessLabel("2026-01-01T00:00:00Z", now)).toBe("");
    expect(freshnessLabel(undefined, now)).toBe("");
  });

  it("marks only genuinely fresh labels as live", () => {
    expect(isFresh("now")).toBe(true);
    expect(isFresh("9h")).toBe(false);
    expect(isFresh("3d")).toBe(false);
    expect(isFresh("")).toBe(false);
  });
});
