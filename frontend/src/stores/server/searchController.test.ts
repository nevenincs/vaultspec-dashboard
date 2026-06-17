// @vitest-environment happy-dom
//
// The rag-search controller (W02.P16.S32, dashboard-rag-search ADR): the
// stores-layer sole wire client for search.
//
// The degradation STATE MACHINE — idle / loading / results / no-results /
// semantic-offline / error, the tiers-gated offline gate (never guessed from a
// bare transport error), the fresh-error-wins-over-stale-success rule, the
// text-match fallback band, the code-target no-fallback state, and the
// ring-cap-safe rag-health detector — is covered by PURE-FUNCTION tests over
// explicit tier/error vectors (interpretSearch / isSemanticOffline /
// isTransportError / latestBackendsRagAvailable / buildFallbackResults). Those
// are inputs to pure functions, not engine doubles.
//
// The live `useSearchController` tests below run against the REAL engine and
// cover the WIRING for the states a healthy live surface actually produces (idle,
// debounce coalescing, a real settled search). The failure-injection wiring tests
// the old mock drove (mock.degrade() → semantic-offline, a fabricated 500, a
// held-open superseded response, a rag-came-back SSE frame) are NOT reproducible
// against a healthy live engine and are intentionally not faked here — their LOGIC
// is fully pinned by the pure interpretSearch tests. Restoring live degradation
// wiring would need a rag-DOWN engine instance (see FINDINGS S1).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { liveScope, liveTransport } from "../../testing/liveClient";
import type { SearchResult, TiersBlock, VaultTreeEntry } from "./engine";
import { EngineError, engineClient } from "./engine";
import type { StreamChunk } from "./queries";
import { STREAM_RETENTION, streamReducer } from "./queries";
import { queryClient } from "./queryClient";
import {
  buildFallbackResults,
  interpretSearch,
  isSemanticOffline,
  isTransportError,
  latestBackendsRagAvailable,
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

// --- rag-health transition detector (value-based, ring-cap safe) --------------------

const frame = (rag: string): StreamChunk => ({ channel: "backends", data: { rag } });

describe("latestBackendsRagAvailable (value-based, survives the 256-frame ring cap)", () => {
  it("is undefined when no rag-bearing backends frame has arrived yet", () => {
    expect(latestBackendsRagAvailable(undefined)).toBeUndefined();
    expect(latestBackendsRagAvailable([])).toBeUndefined();
    const noRagFrame: StreamChunk = { channel: "backends", data: {} };
    expect(latestBackendsRagAvailable([noRagFrame])).toBeUndefined();
  });

  it("reads availability from the MOST-RECENT rag frame (running ⇒ available)", () => {
    expect(latestBackendsRagAvailable([frame("running")])).toBe(true);
    expect(latestBackendsRagAvailable([frame("stopped")])).toBe(false);
    // Latest frame wins over earlier ones.
    expect(
      latestBackendsRagAvailable([
        frame("running"),
        frame("stopped"),
        frame("running"),
      ]),
    ).toBe(true);
    expect(
      latestBackendsRagAvailable([
        frame("running"),
        frame("running"),
        frame("stopped"),
      ]),
    ).toBe(false);
  });

  it("only 'running' is available — any other lifecycle word is down", () => {
    expect(latestBackendsRagAvailable([frame("absent")])).toBe(false);
    expect(latestBackendsRagAvailable([frame("starting")])).toBe(false);
  });

  it("reads the value AFTER the ring cap saturates — the length-based detector's death", () => {
    // streamReducer ring-caps at STREAM_RETENTION (256): a length detector pins
    // forever once full and drops every later transition. Drive the ACTUAL
    // accumulator through `streamReducer` past saturation, then a recovery frame:
    // the capped accumulator is exactly STREAM_RETENTION long (so a length
    // detector sees no growth and never fires), yet the value detector still reads
    // the newest carried value — the >256 regression the HIGH finding named.
    let acc: StreamChunk[] = [];
    for (let i = 0; i < 300; i++) acc = streamReducer(acc, frame("stopped"));
    expect(acc.length).toBe(STREAM_RETENTION); // capped — length is pinned
    expect(latestBackendsRagAvailable(acc)).toBe(false);
    const before = acc.length;
    acc = streamReducer(acc, frame("running")); // the recovery frame
    expect(acc.length).toBe(before); // STILL capped — a length detector sees no edge
    expect(latestBackendsRagAvailable(acc)).toBe(true); // value detector flips
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

// --- the live controller hook (real engine transport) ------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useSearchController (real engine, live wiring)", () => {
  let scope: string;
  beforeAll(async () => {
    scope = await liveScope();
    engineClient.useTransport(liveTransport);
  });
  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it("idle for an empty query — disabled, no request", () => {
    const { result } = renderHook(() => useSearchController("", "vault", scope), { wrapper });
    expect(result.current.state).toBe("idle");
  });

  it("debounces the keystroke stream: a fast burst issues ONE request for the settled term", async () => {
    // A real counter wrapping the live transport (observation, not a fake): a
    // keystroke burst must coalesce into a single /search request.
    let searchRequests = 0;
    engineClient.useTransport((input, init) => {
      if (input.replace(/^\/api/, "").startsWith("/search")) searchRequests += 1;
      return liveTransport(input, init);
    });

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useSearchController(q, "vault", scope),
      { wrapper, initialProps: { q: "" } },
    );

    // Three keystrokes faster than the debounce window: nothing fires mid-burst.
    rerender({ q: "a" });
    rerender({ q: "al" });
    rerender({ q: "alpha" });
    expect(searchRequests).toBe(0);

    // After the window the settled term issues a request; the burst coalesces to
    // EXACTLY ONE (not one per keystroke) because the debounce drops the in-flight
    // intermediate terms.
    await waitFor(() => expect(searchRequests).toBeGreaterThanOrEqual(1), {
      timeout: 6000,
    });
    expect(searchRequests).toBe(1);

    engineClient.useTransport(liveTransport);
  });

  it("a real query settles to a terminal state and threads identity-bearing results", async () => {
    // The wiring proof: a live /search threads the real engine response through
    // adaptSearch + interpretSearch to a non-loading terminal state. Whichever
    // state the live rag tier yields (results / no-results / semantic-offline),
    // any results it carries are identity-bearing (node_id preserved through the
    // nested-envelope unwrap), and the fallback band stays below semantic certainty.
    const { result } = renderHook(() => useSearchController("alpha", "vault", scope), {
      wrapper,
    });
    // Wait for a true terminal state (idle is the pre-request state, so exclude it).
    await waitFor(
      () =>
        expect(["results", "no-results", "semantic-offline", "error"]).toContain(
          result.current.state,
        ),
      { timeout: 6000 },
    );
    for (const r of result.current.results) {
      expect(r.node_id).not.toBeNull();
      // semantic-offline fallback rows stay strictly below the semantic band.
      if (result.current.semanticOffline) expect(r.score).toBeLessThan(1);
    }
  });
});
