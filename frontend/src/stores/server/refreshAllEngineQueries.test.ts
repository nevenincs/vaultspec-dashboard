// Refresh optimization passes (global-context-actions): the light Refresh sweep
// collapses to ONE active-only predicate invalidation and coalesces rapid repeats.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { engineKeys, refreshAllEngineQueries, REFRESH_COALESCE_MS } from "./queries";
import { queryClient } from "./queryClient";

describe("refreshAllEngineQueries (optimized)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("invalidates the whole engine tree in ONE active-only call", () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    vi.setSystemTime(1_000_000);
    refreshAllEngineQueries();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      queryKey: engineKeys.all,
      refetchType: "active",
    });
  });

  it("coalesces rapid repeats inside REFRESH_COALESCE_MS, fires again after", () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    vi.setSystemTime(2_000_000);
    refreshAllEngineQueries(); // fires
    vi.setSystemTime(2_000_000 + REFRESH_COALESCE_MS - 50);
    refreshAllEngineQueries(); // coalesced (within window)
    expect(spy).toHaveBeenCalledTimes(1);
    vi.setSystemTime(2_000_000 + REFRESH_COALESCE_MS + 10);
    refreshAllEngineQueries(); // window elapsed -> fires
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
