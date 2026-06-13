import { afterEach, describe, expect, it, vi } from "vitest";

import { debounce } from "./timing";
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
