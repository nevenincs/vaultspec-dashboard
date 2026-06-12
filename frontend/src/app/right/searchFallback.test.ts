import { describe, expect, it } from "vitest";

import type { VaultTreeEntry } from "../../stores/server/engine";
import { buildFallbackResults } from "./searchFallback";

const entry = (path: string, tags: string[] = []): VaultTreeEntry => ({
  path,
  doc_type: "adr",
  feature_tags: tags,
  dates: {},
});

describe("buildFallbackResults (G8.a text-match fallback)", () => {
  const entries = [
    entry(".vault/adr/2026-06-12-auth-flow-adr.md", ["auth-flow"]),
    entry(".vault/plan/2026-06-12-sync-service-plan.md", ["sync-service"]),
  ];

  it("matches stems and feature tags, clickable via derived node ids", () => {
    const results = buildFallbackResults(entries, "auth");
    expect(results).toHaveLength(1);
    expect(results[0].node_id).toBe("doc:2026-06-12-auth-flow-adr");
    expect(results[0].excerpt).toContain("#auth-flow");
  });

  it("scores below the semantic band and orders by match position", () => {
    const results = buildFallbackResults(entries, "2026-06-12");
    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.score).toBeLessThan(1);
      expect(result.score).toBeGreaterThan(0);
    }
  });

  it("is empty without a query or entries", () => {
    expect(buildFallbackResults(entries, "  ")).toEqual([]);
    expect(buildFallbackResults(undefined, "auth")).toEqual([]);
    expect(buildFallbackResults(entries, "no-such-thing")).toEqual([]);
  });
});
