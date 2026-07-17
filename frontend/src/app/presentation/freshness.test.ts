import { describe, expect, it } from "vitest";

import { freshness, freshnessToneClass } from "./freshness";
import { createTestLocalizationRuntime } from "../../localization/testing";
import { resolveMessage } from "../../platform/localization/fallback";

const runtime = createTestLocalizationRuntime();

function rendered(modified: string | undefined, now: number): string | null {
  const value = freshness(modified, now);
  return value === null ? null : resolveMessage(runtime, value.descriptor);
}

describe("freshness presentation", () => {
  it("labels freshness in compact buckets and cools to silence", () => {
    const now = Date.parse("2026-06-12T12:00:00Z");
    expect(rendered("2026-06-12T11:30:00Z", now)).toBe("Now");
    expect(rendered("2026-06-12T03:00:00Z", now)).toBe("9h");
    expect(rendered("2026-06-09T12:00:00Z", now)).toBe("3d");
    expect(rendered("2026-05-30T12:00:00Z", now)).toBe("1w");
    expect(freshness("2026-01-01T00:00:00Z", now)).toBeNull();
    expect(freshness(undefined, now)).toBeNull();
    expect(freshness("not-a-date", now)).toBeNull();
  });

  it("marks only the genuinely live bucket as fresh and tones it accordingly", () => {
    const now = Date.parse("2026-06-12T12:00:00Z");
    expect(freshness("2026-06-12T11:30:00Z", now)?.fresh).toBe(true);
    expect(freshness("2026-06-12T03:00:00Z", now)?.fresh).toBe(false);
    expect(freshness("2026-06-09T12:00:00Z", now)?.fresh).toBe(false);
    expect(freshnessToneClass(true)).toBe("text-state-active");
    expect(freshnessToneClass(false)).toBe("text-ink-muted");
  });
});
