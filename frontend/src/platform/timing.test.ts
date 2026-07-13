import { afterEach, describe, expect, it, vi } from "vitest";

import { debounce, throttleTrailing } from "./timing";
import { storm } from "../testing/adverse";

describe("debounce", () => {
  afterEach(() => vi.useRealTimers());

  it("collapses a burst into a single trailing call with the last args", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 150);
    storm(200, (i) => d(i)); // a 200-call storm
    expect(fn).not.toHaveBeenCalled(); // nothing fired yet
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledTimes(1); // coalesced to ONE
    expect(fn).toHaveBeenCalledWith(199); // trailing args win
  });

  it("fires again for a second burst after the window", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d("a");
    vi.advanceTimersByTime(100);
    d("b");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("cancel() drops a pending trailing call", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d("x");
    d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("throttleTrailing (cooldown floor)", () => {
  afterEach(() => vi.useRealTimers());

  it("fires once immediately (leading) then once trailing for a burst", () => {
    // The graph-slice-delta D1 storm floor: a burst spaced within the window yields
    // exactly ONE immediate sweep + ONE trailing sweep (with the latest args), never
    // a mid-storm extra.
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = throttleTrailing(fn, 15_000);
    storm(50, (i) => t(i));
    // Leading edge fired immediately with the FIRST args; nothing trailing yet.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(0);
    vi.advanceTimersByTime(15_000);
    // One trailing call with the LATEST args — no mid-storm extras.
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(49);
  });

  it("spaces sustained churn at least the cooldown apart", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = throttleTrailing(fn, 1_000);
    t("a"); // leading fire
    vi.advanceTimersByTime(500);
    t("b"); // within cooldown → scheduled trailing
    vi.advanceTimersByTime(499);
    expect(fn).toHaveBeenCalledTimes(1); // still cooling down
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(2); // trailing fired at the window edge
    expect(fn).toHaveBeenLastCalledWith("b");
  });

  it("a call after the cooldown fires immediately again", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = throttleTrailing(fn, 1_000);
    t("a");
    vi.advanceTimersByTime(1_000);
    t("b"); // cooldown elapsed → immediate
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("b");
  });

  it("cancel() drops a pending trailing call", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = throttleTrailing(fn, 1_000);
    t("a"); // leading fire
    t("b"); // scheduled trailing
    t.cancel();
    vi.advanceTimersByTime(2_000);
    expect(fn).toHaveBeenCalledTimes(1); // only the leading fire survived
  });
});
