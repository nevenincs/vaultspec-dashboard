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
import { SEARCH_QUERY_MAX_CHARS, normalizeSearchQuery } from "../searchQuery";
import type { SearchResult, TiersBlock } from "./engine";
import { EngineError, engineClient } from "./engine";
import type { StreamChunk } from "./queries";
import {
  engineKeys,
  normalizeSearchRequestIdentity,
  normalizeSearchScope,
  normalizeSearchTarget,
  STREAM_RETENTION,
  streamReducer,
} from "./queries";
import { queryClient } from "./queryClient";
import {
  interpretSearch,
  isSemanticOffline,
  isTransportError,
  latestBackendsRagAvailable,
  mergeSemanticEpoch,
  normalizeSearchRagLifecycleWord,
  pathStem,
  pathToDocNodeId,
  SEARCH_DEBOUNCE_MS,
  SEARCH_RAG_LIFECYCLE_WORD_MAX_CHARS,
  useSearchController,
} from "./searchController";
import { ENGINE_WAIT } from "../../testing/timing";

const noop = () => undefined;

describe("normalizeSearchQuery (shared search request identity)", () => {
  it("trims, bounds, and rejects non-string search input before query keys or wire reads", () => {
    expect(normalizeSearchQuery(null)).toBe("");
    expect(normalizeSearchQuery("  graph state  ")).toBe("graph state");
    expect(normalizeSearchQuery(" x ".repeat(SEARCH_QUERY_MAX_CHARS))).toHaveLength(
      SEARCH_QUERY_MAX_CHARS,
    );
  });

  it("normalizes target and scope before query keys or wire reads", () => {
    expect(normalizeSearchTarget("code")).toBe("code");
    expect(normalizeSearchTarget(" code ")).toBe("code");
    expect(normalizeSearchTarget("vault")).toBe("vault");
    expect(normalizeSearchTarget("history")).toBe("vault");
    expect(normalizeSearchTarget(null)).toBe("vault");

    expect(normalizeSearchScope(" scope-a ")).toBe("scope-a");
    expect(normalizeSearchScope("   ")).toBeNull();
    expect(normalizeSearchScope({ scope: "scope-a" })).toBeNull();

    expect(
      normalizeSearchRequestIdentity("  graph state  ", " code ", " scope-a "),
    ).toEqual({
      query: "graph state",
      target: "code",
      scope: "scope-a",
    });
  });
});

// The rag-down text fallback (`buildFallbackResults`) retired with the ADR D2
// fold: name matches now come from the files(vault) search provider through the
// one shared literal matcher, covered by `literalMatch` + `searchProviders`
// vectors. The tiers-gated `semanticOffline` truth this controller still exports
// is exercised below.

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
  it("normalizes rag lifecycle words at the stream seam", () => {
    expect(normalizeSearchRagLifecycleWord(" running ")).toBe("running");
    expect(normalizeSearchRagLifecycleWord("   ")).toBeUndefined();
    expect(normalizeSearchRagLifecycleWord({ rag: "running" })).toBeUndefined();
    expect(
      normalizeSearchRagLifecycleWord(
        "x".repeat(SEARCH_RAG_LIFECYCLE_WORD_MAX_CHARS + 1),
      ),
    ).toBeUndefined();
  });

  it("is undefined when no rag-bearing backends frame has arrived yet", () => {
    expect(latestBackendsRagAvailable(undefined)).toBeUndefined();
    expect(latestBackendsRagAvailable([])).toBeUndefined();
    const noRagFrame: StreamChunk = { channel: "backends", data: {} };
    expect(latestBackendsRagAvailable([noRagFrame])).toBeUndefined();
  });

  it("ignores rag-looking payloads from non-backend channels", () => {
    expect(
      latestBackendsRagAvailable([
        { channel: "git", data: { rag: "running" } },
        { channel: "message", data: { rag: "running" } },
      ]),
    ).toBeUndefined();
    expect(
      latestBackendsRagAvailable([
        { channel: "git", data: { rag: "running" } },
        { channel: " backends ", data: { rag: " stopped " } },
      ]),
    ).toBe(false);
  });

  it("reads availability from the MOST-RECENT rag frame (running ⇒ available)", () => {
    expect(latestBackendsRagAvailable([frame("running")])).toBe(true);
    expect(
      latestBackendsRagAvailable([{ channel: "backends", data: { rag: " running " } }]),
    ).toBe(true);
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
    expect(
      latestBackendsRagAvailable([
        frame("running"),
        frame("x".repeat(SEARCH_RAG_LIFECYCLE_WORD_MAX_CHARS + 1)),
      ]),
    ).toBe(true);
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

  it("semantic-offline: tiers-gated, contributes NO results (files provider carries names)", () => {
    // ADR D2 fold: the controller no longer serves a text fallback. When rag is
    // offline it reports the tiers-gated `semanticOffline` truth and an EMPTY
    // result set — the files(vault) provider carries name matches in the host.
    const v = interpretSearch({
      ...base,
      query: "auth",
      data: undefined,
      error: new EngineError("/search", 502, {
        tiers: { semantic: { available: false, reason: "rag down" } },
      }),
      isPending: false,
    });
    expect(v.state).toBe("semantic-offline");
    expect(v.semanticOffline).toBe(true);
    expect(v.results).toEqual([]);
  });

  it("semantic-offline is target-independent now the fallback folded away", () => {
    const v = interpretSearch({
      ...base,
      target: "code",
      query: "auth",
      data: undefined,
      error: new EngineError("/search", 502, {
        tiers: { semantic: { available: false } },
      }),
      isPending: false,
    });
    expect(v.state).toBe("semantic-offline");
    expect(v.semanticOffline).toBe(true);
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

  it("surfaces served index_state + semantic_epoch on a results outcome (D3, raw)", () => {
    const indexState = {
      source: "vault",
      indexed_count: 3173,
      target_matches: true,
      status: "available",
    };
    const v = interpretSearch({
      ...base,
      query: "auth",
      data: {
        results: [hit()],
        tiers: { semantic: { available: true } },
        index_state: indexState,
        semantic_epoch: 42,
      },
      error: null,
      isPending: false,
    });
    expect(v.state).toBe("results");
    // Raw served truth, presentation-mapped only downstream.
    expect(v.semanticEpoch).toBe(42);
    expect(v.indexState).toEqual(indexState);
    // The reference is forwarded, never cloned (frontend-store-selectors: no
    // fresh reference minted), so identity is stable across renders.
    expect(v.indexState).toBe(indexState);
  });

  it("preserves a null semantic_epoch (honest known-unknown), distinct from absent", () => {
    const v = interpretSearch({
      ...base,
      query: "auth",
      data: {
        results: [hit()],
        tiers: { semantic: { available: true } },
        semantic_epoch: null,
      },
      error: null,
      isPending: false,
    });
    expect(v.semanticEpoch).toBeNull();
    expect(v.indexState).toBeUndefined();
  });

  it("idle reports no served freshness", () => {
    const v = interpretSearch({
      ...base,
      query: "",
      data: undefined,
      error: null,
      isPending: false,
    });
    expect(v.state).toBe("idle");
    expect(v.semanticEpoch).toBeUndefined();
    expect(v.indexState).toBeUndefined();
  });
});

describe("mergeSemanticEpoch (one shared epoch across the two corpora)", () => {
  it("prefers a concrete number over null over undefined", () => {
    expect(mergeSemanticEpoch(42, null)).toBe(42);
    expect(mergeSemanticEpoch(null, 7)).toBe(7);
    expect(mergeSemanticEpoch(5, 9)).toBe(5); // both warm, agree in practice
  });

  it("collapses to null only when neither corpus served a number but one is known-unknown", () => {
    expect(mergeSemanticEpoch(null, undefined)).toBeNull();
    expect(mergeSemanticEpoch(undefined, null)).toBeNull();
  });

  it("is undefined only when neither corpus served an epoch", () => {
    expect(mergeSemanticEpoch(undefined, undefined)).toBeUndefined();
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
    engineClient.useTransport(liveTransport);
  });

  it("idle for an empty query — disabled, no request", () => {
    const { result } = renderHook(() => useSearchController("", "vault", scope), {
      wrapper,
    });
    expect(result.current.state).toBe("idle");
  });

  it("treats whitespace-only input as idle and does not issue a search request", async () => {
    let searchRequests = 0;
    engineClient.useTransport((input, init) => {
      if (input.replace(/^\/api/, "").startsWith("/search")) searchRequests += 1;
      return liveTransport(input, init);
    });

    const { result } = renderHook(() => useSearchController("   ", "vault", scope), {
      wrapper,
    });

    expect(result.current.state).toBe("idle");
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 50));
    expect(searchRequests).toBe(0);
  });

  it("treats a non-empty query without an active scope as idle and does not issue a search request", async () => {
    let searchRequests = 0;
    engineClient.useTransport((input, init) => {
      if (input.replace(/^\/api/, "").startsWith("/search")) searchRequests += 1;
      return liveTransport(input, init);
    });

    const { result } = renderHook(() => useSearchController("alpha", "vault", null), {
      wrapper,
    });

    expect(result.current.state).toBe("idle");
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 50));
    expect(searchRequests).toBe(0);
  });

  it("normalizes malformed request identity inputs before issuing a search", async () => {
    let searchRequests = 0;
    engineClient.useTransport((input, init) => {
      if (input.replace(/^\/api/, "").startsWith("/search")) searchRequests += 1;
      return liveTransport(input, init);
    });

    const { result } = renderHook(
      () => useSearchController("alpha", { target: "code" }, { scope }),
      { wrapper },
    );

    expect(result.current.state).toBe("idle");
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 50));
    expect(searchRequests).toBe(0);
  });

  it("debounces the keystroke stream: a fast burst issues ONE request for the settled term", async () => {
    // A real counter wrapping the live transport (observation, not a fake): a
    // keystroke burst must coalesce into a single /search request.
    let searchRequests = 0;
    engineClient.useTransport((input, init) => {
      if (input.replace(/^\/api/, "").startsWith("/search")) searchRequests += 1;
      return liveTransport(input, init);
    });

    const { rerender } = renderHook(
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
    await waitFor(() => expect(searchRequests).toBeGreaterThanOrEqual(1), ENGINE_WAIT);
    expect(searchRequests).toBe(1);

    engineClient.useTransport(liveTransport);
  });

  it("debounces target switches with the query so stale terms do not cross targets", async () => {
    const searchBodies: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.replace(/^\/api/, "").startsWith("/search")) {
        searchBodies.push(String(init?.body ?? ""));
      }
      return liveTransport(input, init);
    });

    const { rerender } = renderHook(
      ({ q, target }: { q: string; target: "vault" | "code" }) =>
        useSearchController(q, target, scope),
      { wrapper, initialProps: { q: "", target: "vault" } },
    );

    rerender({ q: "a", target: "vault" });
    rerender({ q: "al", target: "vault" });
    rerender({ q: "alpha", target: "vault" });
    rerender({ q: "alpha", target: "code" });
    expect(searchBodies).toEqual([]);

    await waitFor(() => expect(searchBodies).toHaveLength(1), ENGINE_WAIT);
    // The corpus target rides the wire as `type` (rag's vocabulary; see
    // EngineClient.search) — a `target` key never reaches the wire.
    expect(JSON.parse(searchBodies[0])).toMatchObject({
      query: "alpha",
      type: "code",
      scope,
    });

    engineClient.useTransport(liveTransport);
  });

  it("does not expose cached disabled-key results while a new request is debouncing", async () => {
    queryClient.setQueryData(engineKeys.search("", "alphabet", "vault"), {
      results: [hit("doc:disabled-cache")],
      tiers: { semantic: { available: true } },
    });

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useSearchController(q, "vault", scope),
      { wrapper, initialProps: { q: "alpha" } },
    );

    await waitFor(
      () =>
        expect(["results", "no-results", "semantic-offline", "error"]).toContain(
          result.current.state,
        ),
      ENGINE_WAIT,
    );

    rerender({ q: "alphabet" });

    expect(result.current).toMatchObject({
      state: "loading",
      results: [],
      filterVocabulary: undefined,
    });
  });

  it("keeps filter vocabulary scoped to the settled search identity during debounce", async () => {
    const filterRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      const path = input.replace(/^\/api/, "");
      if (path.startsWith("/filters")) filterRequests.push(path);
      return liveTransport(input, init);
    });

    const { rerender } = renderHook(
      ({ q, activeScope }: { q: string; activeScope: string }) =>
        useSearchController(q, "vault", activeScope),
      { wrapper, initialProps: { q: "alpha", activeScope: scope } },
    );

    await waitFor(() => expect(filterRequests.length).toBeGreaterThan(0), ENGINE_WAIT);
    filterRequests.length = 0;

    const nextScope = `${scope}-not-yet-settled`;
    rerender({ q: "alphabet", activeScope: nextScope });
    await new Promise((resolve) =>
      setTimeout(resolve, Math.floor(SEARCH_DEBOUNCE_MS / 2)),
    );

    expect(filterRequests).toEqual([]);

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
      ENGINE_WAIT,
    );
    for (const r of result.current.results) {
      expect(r.node_id).not.toBeNull();
      // semantic-offline fallback rows stay strictly below the semantic band.
      if (result.current.semanticOffline) expect(r.score).toBeLessThan(1);
    }
  });

  it("rag-gated: a real semantic search serves the freshness contract when the semantic tier is up", async (ctx) => {
    // The rag-gated live SUCCESS test (rag-integration-hardening D4): drive a real
    // settled query through the controller and assert the served FRESHNESS
    // contract — but only when the served tiers report the semantic tier
    // available. The gate is the wire's own tiers truth, read through the
    // controller's tiers-gated `semanticOffline` (and the transport-error state),
    // never guessed: on a machine with no resident rag the fixture serve degrades
    // the semantic tier, so this SKIPS honestly with a stated reason rather than
    // asserting a chain that cannot run. The fixture serve scopes a scratch vault
    // copy rag has not indexed, so the honest live outcome here is a semantic
    // no-results (empty hits) that STILL carries the freshness envelope.
    const { result } = renderHook(() => useSearchController("graph", "vault", scope), {
      wrapper,
    });
    await waitFor(
      () =>
        expect(["results", "no-results", "semantic-offline", "error"]).toContain(
          result.current.state,
        ),
      ENGINE_WAIT,
    );

    // Gate on served tiers truth: a degraded semantic tier (no resident rag) or a
    // transport fault means the success chain cannot be exercised — skip loudly.
    if (result.current.semanticOffline || result.current.state === "error") {
      ctx.skip(
        `semantic tier unavailable on this machine (state=${result.current.state}, ` +
          `semanticOffline=${result.current.semanticOffline}); live search success ` +
          `chain not exercised — needs a resident rag`,
      );
      return;
    }

    // Semantic tier is up: the outcome is a real semantic terminal state
    // (results when the scope is indexed, no-results for the unindexed fixture),
    // never the offline fallback band.
    expect(["results", "no-results"]).toContain(result.current.state);

    // Served freshness rides the interpreted view (D3): the shared epoch is a
    // number (warm cache) or an explicit null (cold — a known-unknown), never
    // undefined on an active search; rag's index_state is forwarded as an object
    // (or absent per the adapter contract when the engine degraded to a shape
    // miss, which is not this success path).
    const { semanticEpoch, indexState } = result.current;
    expect(semanticEpoch === null || typeof semanticEpoch === "number").toBe(true);
    expect(indexState === undefined || typeof indexState === "object").toBe(true);

    // Every hit carries the engine's node-id value-add key (null on a typed
    // annotation miss, never a dropped key). Vacuous on the unindexed no-results
    // outcome; load-bearing when the scope is indexed.
    for (const r of result.current.results) {
      expect(r).toHaveProperty("node_id");
    }
  });
});
