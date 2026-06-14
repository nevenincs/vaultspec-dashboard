import { describe, expect, it } from "vitest";

import type { TiersBlock, VaultTreeEntry } from "../../stores/server/engine";
import { EngineError } from "../../stores/server/engine";
import {
  buildFallbackResults,
  isSemanticOffline,
  isTransportError,
} from "./searchFallback";

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

describe("isSemanticOffline (tiers seam — search ADR degraded row)", () => {
  const ok: TiersBlock = {
    semantic: { available: true },
    structural: { available: true },
  };
  const down: TiersBlock = {
    semantic: { available: false, reason: "rag service down" },
    structural: { available: true },
  };
  const absent: TiersBlock = { structural: { available: true } };

  it("reads degradation from a SUCCESS envelope's tiers block", () => {
    expect(isSemanticOffline(undefined, ok)).toBe(false);
    expect(isSemanticOffline(undefined, down)).toBe(true);
  });

  it("treats a tier ABSENT from a served block as degraded (absence is degradation)", () => {
    expect(isSemanticOffline(undefined, absent)).toBe(true);
  });

  it("reads degradation from an EngineError envelope's preserved tiers block", () => {
    // A rag-down 502 carries the tiers block through the error path — that is
    // degradation, not a bare error.
    const err = new EngineError("/search", 502, { tiers: down });
    expect(isSemanticOffline(err, undefined)).toBe(true);
  });

  it("is NOT degraded for a transport fault with no tiers envelope", () => {
    // A genuine transport failure carries no structured block — not degradation.
    const err = new EngineError("/search", 500);
    expect(isSemanticOffline(err, undefined)).toBe(false);
    expect(isSemanticOffline(undefined, undefined)).toBe(false);
  });
});

describe("isTransportError (error vs degradation, the tiers contract)", () => {
  it("is true only for an error carrying NO tiers envelope", () => {
    expect(isTransportError(new EngineError("/search", 500))).toBe(true);
    expect(isTransportError(new Error("network down"))).toBe(true);
  });

  it("is false for a tiered error (degradation) and for no error", () => {
    const tiered = new EngineError("/search", 502, {
      tiers: { semantic: { available: false } },
    });
    expect(isTransportError(tiered)).toBe(false);
    expect(isTransportError(null)).toBe(false);
    expect(isTransportError(undefined)).toBe(false);
  });
});
