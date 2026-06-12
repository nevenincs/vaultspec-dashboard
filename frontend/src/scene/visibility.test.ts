import { describe, expect, it } from "vitest";

import { FADE_DURATION_MS, VisibilityTracker } from "./visibility";

const ids = (...xs: string[]) => new Set(xs);

describe("VisibilityTracker", () => {
  it("fades entering ids from 0 toward 1", () => {
    const v = new VisibilityTracker();
    v.setVisible(ids("a"), 0);
    const mid = v.sample(FADE_DURATION_MS / 2);
    const p = mid.progress.get("a")!;
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    expect(mid.animating).toBe(true);
    const done = v.sample(FADE_DURATION_MS + 1);
    expect(done.progress.get("a")).toBe(1);
    expect(done.animating).toBe(false);
  });

  it("fades leaving ids toward 0 and drops them when settled", () => {
    const v = new VisibilityTracker();
    v.setVisible(ids("a"), 0);
    v.sample(FADE_DURATION_MS + 1);
    v.setVisible(ids(), 1000);
    const mid = v.sample(1000 + FADE_DURATION_MS / 2);
    const p = mid.progress.get("a")!;
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    const done = v.sample(1000 + FADE_DURATION_MS + 1);
    expect(done.progress.has("a")).toBe(false);
    expect(done.animating).toBe(false);
  });

  it("retargets mid-transition without snapping", () => {
    const v = new VisibilityTracker();
    v.setVisible(ids("a"), 0);
    // Halfway through the fade-in, hide again.
    const midIn = v.sample(FADE_DURATION_MS / 2).progress.get("a")!;
    v.setVisible(ids(), FADE_DURATION_MS / 2);
    const justAfter = v.sample(FADE_DURATION_MS / 2 + 1).progress.get("a")!;
    expect(Math.abs(justAfter - midIn)).toBeLessThan(0.1);
  });

  it("keeps settled visible ids at progress 1 without transitions", () => {
    const v = new VisibilityTracker();
    v.setVisible(ids("a", "b"), 0);
    v.sample(FADE_DURATION_MS + 1);
    const s = v.sample(FADE_DURATION_MS + 500);
    expect(s.progress.get("a")).toBe(1);
    expect(s.progress.get("b")).toBe(1);
    expect(s.animating).toBe(false);
  });

  it("counts hidden ids against a known universe", () => {
    const v = new VisibilityTracker();
    v.setVisible(ids("a"), 0);
    expect(v.hiddenCount(["a", "b", "c"])).toBe(2);
    expect(v.visibleIds.has("a")).toBe(true);
  });
});
