// @vitest-environment happy-dom
//
// The rag-search controller (W02.P16.S32, dashboard-rag-search ADR): the
// stores-layer sole wire client for search. These tests exercise the pure
// interpreted state machine (idle / loading / results / no-results /
// semantic-offline / error), the tiers-gated degradation gate (never guessed
// from a bare transport error), the text-match fallback band kept strictly below
// semantic certainty, the code-target-offline explicit no-fallback state, and the
// debounced keystroke stream — all against the REAL stores client transport
// (mockEngine), with no controller-internal doubles.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import type { SearchResult, TiersBlock, VaultTreeEntry } from "./engine";
import { EngineError, engineClient } from "./engine";
import { queryClient } from "./queryClient";
import {
  buildFallbackResults,
  interpretSearch,
  isSemanticOffline,
  isTransportError,
  pathStem,
  pathToDocNodeId,
  useSearchController,
} from "./searchController";

const entry = (path: string, tags: string[] = []): VaultTreeEntry => ({
  path,
  doc_type: "adr",
  feature_tags: tags,
  dates: {},
});

const noop = () => undefined;

// --- pure fallback matching (relocated from the chrome layer) ----------------------

describe("buildFallbackResults (text-match fallback, search ADR)", () => {
  const entries = [
    entry(".vault/adr/2026-06-12-auth-flow-adr.md", ["auth-flow"]),
    entry(".vault/plan/2026-06-12-sync-service-plan.md", ["sync-service"]),
  ];

  it("matches stems and feature tags, clickable via derived doc node ids", () => {
    const results = buildFallbackResults(entries, "auth");
    expect(results).toHaveLength(1);
    expect(results[0].node_id).toBe("doc:2026-06-12-auth-flow-adr");
    expect(results[0].excerpt).toContain("#auth-flow");
  });

  it("scores STRICTLY below the semantic certainty band (never reads as a hit)", () => {
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

describe("node-id grammar (stores-owned, §2 identity)", () => {
  it("stems a vault path and forms its doc node id", () => {
    expect(pathStem(".vault/adr/2026-06-12-auth-flow-adr.md")).toBe(
      "2026-06-12-auth-flow-adr",
    );
    expect(pathToDocNodeId(".vault/adr/2026-06-12-auth-flow-adr.md")).toBe(
      "doc:2026-06-12-auth-flow-adr",
    );
  });
});

// --- tiers-gated degradation seam (pure) -------------------------------------------

describe("isSemanticOffline (tiers-gated, never guessed)", () => {
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

  it("reads degradation from a 502 EngineError envelope's preserved tiers block", () => {
    const err = new EngineError("/search", 502, { tiers: down });
    expect(isSemanticOffline(err, undefined)).toBe(true);
  });

  it("is NOT degraded for a transport fault with no tiers envelope (never guessed)", () => {
    expect(isSemanticOffline(new EngineError("/search", 500), undefined)).toBe(false);
    expect(isSemanticOffline(undefined, undefined)).toBe(false);
  });

  it("a FRESH error envelope wins over STALE held-success tiers (no masking)", () => {
    // A rag-down 502 arriving after an earlier healthy response: TanStack still
    // holds the prior success `data.tiers` (semantic available), but the fresh
    // error envelope is the live wire truth and must degrade, not be masked.
    const err = new EngineError("/search", 502, { tiers: down });
    expect(isSemanticOffline(err, ok)).toBe(true);
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

// --- the interpreted state machine (pure) ------------------------------------------

const hit = (nodeId: string | null = "doc:x"): SearchResult => ({
  score: 0.8,
  source: "x",
  node_id: nodeId,
});

const base = {
  target: "vault" as const,
  fallbackEntries: undefined,
  fallbackPending: false,
  filterVocabulary: undefined,
  retry: noop,
};

describe("interpretSearch (the explicit state machine)", () => {
  it("idle: an empty query is no request, not loading", () => {
    const v = interpretSearch({
      ...base,
      query: "",
      data: undefined,
      error: null,
      isPending: false,
    });
    expect(v.state).toBe("idle");
    expect(v.results).toEqual([]);
  });

  it("loading: a query in flight with no held data", () => {
    const v = interpretSearch({
      ...base,
      query: "auth",
      data: undefined,
      error: null,
      isPending: true,
    });
    expect(v.state).toBe("loading");
    expect(v.pending).toBe(true);
  });

  it("results: ranked hits served", () => {
    const v = interpretSearch({
      ...base,
      query: "auth",
      data: {
        results: [hit(), hit("doc:y")],
        tiers: { semantic: { available: true } },
      },
      error: null,
      isPending: false,
    });
    expect(v.state).toBe("results");
    expect(v.results).toHaveLength(2);
  });

  it("no-results: a successful search with zero hits — DISTINCT from offline", () => {
    const v = interpretSearch({
      ...base,
      query: "zzz",
      data: { results: [], tiers: { semantic: { available: true } } },
      error: null,
      isPending: false,
    });
    expect(v.state).toBe("no-results");
    expect(v.semanticOffline).toBe(false);
  });

  it("semantic-offline: tiers-gated, serves the vault text-match fallback", () => {
    const v = interpretSearch({
      ...base,
      query: "auth",
      data: undefined,
      error: new EngineError("/search", 502, {
        tiers: { semantic: { available: false, reason: "rag down" } },
      }),
      isPending: false,
      fallbackEntries: [entry(".vault/adr/2026-06-12-auth-flow-adr.md", ["auth-flow"])],
    });
    expect(v.state).toBe("semantic-offline");
    expect(v.semanticOffline).toBe(true);
    expect(v.noCodeFallback).toBe(false);
    expect(v.results[0].node_id).toBe("doc:2026-06-12-auth-flow-adr");
  });

  it("semantic-offline + code target: explicit no-fallback, never a misleading empty", () => {
    const v = interpretSearch({
      ...base,
      target: "code",
      query: "auth",
      data: undefined,
      error: new EngineError("/search", 502, {
        tiers: { semantic: { available: false } },
      }),
      isPending: false,
      fallbackEntries: [entry(".vault/adr/2026-06-12-auth-flow-adr.md", ["auth-flow"])],
    });
    expect(v.state).toBe("semantic-offline");
    expect(v.noCodeFallback).toBe(true);
    // No corpus for code → empty results, but the state is offline (not
    // no-results), so the view renders the explicit notice not a blank "no
    // matches".
    expect(v.results).toEqual([]);
  });

  it("error: a tiers-less transport fault, keeps last-good results under the banner", () => {
    const v = interpretSearch({
      ...base,
      query: "auth",
      data: { results: [hit("doc:held")], tiers: { semantic: { available: true } } },
      error: new EngineError("/search", 500),
      isPending: false,
    });
    expect(v.state).toBe("error");
    expect(v.error).toBe(true);
    expect(v.semanticOffline).toBe(false);
    // Held results stay visible (not blanked) — a transient refetch error must
    // not blank a list the operator was reading.
    expect(v.results).toHaveLength(1);
  });
});

// --- the live controller hook (real transport, mockEngine) -------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useSearchController (real transport, full controller contract)", () => {
  afterEach(() => {
    cleanup();
    queryClient.clear();
    engineClient.useTransport((input, init) => fetch(input, init));
    vi.restoreAllMocks();
  });

  it("debounces the keystroke stream: a fast burst issues ONE request for the settled term", async () => {
    const mock = new MockEngine();
    const searchSpy = vi.fn();
    engineClient.useTransport((input, init) => {
      const url = new URL(input, "http://mock.local");
      if (url.pathname.replace(/^\/api/, "") === "/search") searchSpy();
      return mock.fetchImpl(input, init);
    });

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useSearchController(q, "vault", MOCK_SCOPE),
      { wrapper, initialProps: { q: "" } },
    );

    // Type three characters faster than the debounce window — each rerender is a
    // keystroke. No /search request fires synchronously mid-burst.
    rerender({ q: "a" });
    rerender({ q: "au" });
    rerender({ q: "aut" });
    expect(searchSpy).not.toHaveBeenCalled();

    // Once the window elapses, exactly the settled term issues a single request
    // (not one per keystroke) and the query settles to results.
    await waitFor(() => expect(result.current.state).toBe("results"), {
      timeout: 4000,
    });
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });

  it("idle for an empty query — disabled, no request", () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    const { result } = renderHook(() => useSearchController("", "vault", MOCK_SCOPE), {
      wrapper,
    });
    expect(result.current.state).toBe("idle");
  });

  it("serves results live via the nested rag envelope through adaptSearch", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    const { result } = renderHook(
      () => useSearchController("step", "vault", MOCK_SCOPE),
      { wrapper },
    );
    await waitFor(() => expect(result.current.state).toBe("results"), {
      timeout: 4000,
    });
    expect(result.current.results.length).toBeGreaterThan(0);
    // Each result carries a node id (the engine's §8 annotation, preserved
    // through the nested-envelope unwrap) — click-through is identity-bearing.
    expect(result.current.results[0].node_id).not.toBeNull();
  });

  it("degrades to semantic-offline via the mock's rag-down 502 tiers block", async () => {
    const mock = new MockEngine();
    mock.degrade("semantic", "rag service down");
    engineClient.useTransport(mock.fetchImpl);
    const { result } = renderHook(
      () => useSearchController("auth", "vault", MOCK_SCOPE),
      { wrapper },
    );
    await waitFor(() => expect(result.current.state).toBe("semantic-offline"), {
      timeout: 4000,
    });
    expect(result.current.semanticOffline).toBe(true);
    // The fallback rows score strictly below the semantic band.
    for (const r of result.current.results) {
      expect(r.score).toBeLessThan(1);
    }
  });

  it("code target offline: explicit no-fallback state, never a blank no-results", async () => {
    const mock = new MockEngine();
    mock.degrade("semantic", "rag service down");
    engineClient.useTransport(mock.fetchImpl);
    const { result } = renderHook(
      () => useSearchController("auth", "code", MOCK_SCOPE),
      { wrapper },
    );
    await waitFor(() => expect(result.current.state).toBe("semantic-offline"), {
      timeout: 4000,
    });
    expect(result.current.noCodeFallback).toBe(true);
    expect(result.current.results).toEqual([]);
  });

  it("surfaces a tiers-less transport fault as the error state (not degradation)", async () => {
    engineClient.useTransport((input, init) => {
      const url = new URL(input, "http://mock.local");
      if (url.pathname.replace(/^\/api/, "") === "/search") {
        return Promise.resolve(new Response("boom", { status: 500 }));
      }
      return fetch(input, init);
    });
    const { result } = renderHook(
      () => useSearchController("auth", "vault", MOCK_SCOPE),
      { wrapper },
    );
    await waitFor(() => expect(result.current.state).toBe("error"), { timeout: 4000 });
    expect(result.current.error).toBe(true);
    expect(result.current.semanticOffline).toBe(false);
  });
});
