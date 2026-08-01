import { describe, expect, it } from "vitest";

import {
  drainGenerationListing,
  type GenerationListingPage,
} from "./generationListingDrain";

describe("drainGenerationListing", () => {
  it("captures the first generation, follows cursors, and keeps the latest tiers", async () => {
    const pages: GenerationListingPage<string, string>[] = [
      { entries: ["a"], tiers: "warming", generation: 7, nextCursor: "a" },
      { entries: ["b"], tiers: "ready", generation: 7 },
    ];
    const requests: { cursor: string | undefined; page: number }[] = [];
    const continuations: string[][] = [];

    const result = await drainGenerationListing({
      initialTiers: "unknown",
      maxPages: 4,
      maxRestarts: 1,
      fetchPage: async ({ cursor, page }) => {
        requests.push({ cursor, page });
        return pages[page]!;
      },
      onContinuation: async ({ entries }) => {
        continuations.push(entries);
      },
    });

    expect(requests).toEqual([
      { cursor: undefined, page: 0 },
      { cursor: "a", page: 1 },
    ]);
    expect(continuations).toEqual([["a"]]);
    expect(result).toMatchObject({
      entries: ["a", "b"],
      tiers: "ready",
      generation: 7,
      straddled: false,
      nextCursor: undefined,
      pageCapReached: false,
    });
  });

  it("restarts from page zero when a later page straddles generations", async () => {
    const pages: GenerationListingPage<string, string>[] = [
      { entries: ["old-a"], tiers: "old", generation: 1, nextCursor: "old-a" },
      { entries: ["old-b"], tiers: "old", generation: 2 },
      { entries: ["new-a"], tiers: "new", generation: 3, nextCursor: "new-a" },
      { entries: ["new-b"], tiers: "new", generation: 3 },
    ];
    const requests: { attempt: number; cursor: string | undefined; page: number }[] =
      [];

    const result = await drainGenerationListing({
      initialTiers: "unknown",
      maxPages: 4,
      maxRestarts: 1,
      fetchPage: async (request) => {
        requests.push(request);
        return pages[requests.length - 1]!;
      },
    });

    expect(requests).toEqual([
      { attempt: 0, cursor: undefined, page: 0 },
      { attempt: 0, cursor: "old-a", page: 1 },
      { attempt: 1, cursor: undefined, page: 0 },
      { attempt: 1, cursor: "new-a", page: 1 },
    ]);
    expect(result.entries).toEqual(["new-a", "new-b"]);
    expect(result.generation).toBe(3);
    expect(result.straddled).toBe(false);
  });

  it("drops the baseline after restart exhaustion and reports a remaining cursor at the page cap", async () => {
    const pages: GenerationListingPage<string, string>[] = [
      { entries: ["a"], tiers: "first", generation: 10, nextCursor: "a" },
      { entries: ["b"], tiers: "latest", generation: 11, nextCursor: "b" },
    ];
    let settled = 0;

    const result = await drainGenerationListing({
      initialTiers: "unknown",
      maxPages: 2,
      maxRestarts: 0,
      fetchPage: async ({ page }) => pages[page]!,
      onSettle: () => {
        settled += 1;
      },
    });

    expect(result).toMatchObject({
      entries: ["a", "b"],
      tiers: "latest",
      generation: undefined,
      straddled: true,
      nextCursor: "b",
      pageCapReached: true,
    });
    expect(settled).toBe(1);
  });

  it("settles when a page promise rejects", async () => {
    let settled = 0;

    await expect(
      drainGenerationListing({
        initialTiers: "unknown",
        maxPages: 1,
        maxRestarts: 0,
        fetchPage: async () => Promise.reject(new Error("listing unavailable")),
        onSettle: () => {
          settled += 1;
        },
      }),
    ).rejects.toThrow("listing unavailable");

    expect(settled).toBe(1);
  });
});
