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
import type { SearchResult, TiersBlock, VaultTreeEntry } from "./engine";
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
  buildFallbackResults,
  deriveSearchPresentationView,
  searchResultKeyboardFocusDelta,
  interpretSearch,
  isSemanticOffline,
  isTransportError,
  latestBackendsRagAvailable,
  mergeSemanticEpoch,
  normalizeSearchRagLifecycleWord,
  pathStem,
  pathToDocNodeId,
  SEARCH_DEBOUNCE_MS,
  SEARCH_FALLBACK_RESULTS_MAX_ITEMS,
  SEARCH_RAG_LIFECYCLE_WORD_MAX_CHARS,
  useSearchController,
} from "./searchController";
import { ENGINE_WAIT } from "../../testing/timing";

const entry = (path: string, tags: string[] = []): VaultTreeEntry => ({
  path,
  doc_type: "adr",
  feature_tags: tags,
  dates: {},
});

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
    expect(buildFallbackResults(entries, { query: "auth" })).toEqual([]);
  });

  it("uses the shared bounded search-query normalizer before fallback matching", () => {
    const longQuery = ` auth ${"x".repeat(SEARCH_QUERY_MAX_CHARS)}`;
    expect(buildFallbackResults(entries, " AUTH ")).toHaveLength(1);
    expect(buildFallbackResults(entries, longQuery)).toEqual([]);
  });

  it("keeps fallback result collection bounded without dropping better later hits", () => {
    const noisyEntries = [
      ...Array.from({ length: SEARCH_FALLBACK_RESULTS_MAX_ITEMS + 8 }, (_, index) =>
        entry(`.vault/adr/low-${index}-needle.md`, []),
      ),
      entry(".vault/adr/needle-best.md", []),
    ];

    const results = buildFallbackResults(noisyEntries, "needle");

    expect(results).toHaveLength(SEARCH_FALLBACK_RESULTS_MAX_ITEMS);
    expect(results[0].node_id).toBe("doc:needle-best");
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

describe("deriveSearchPresentationView (SearchTab display facts)", () => {
  it("projects result keyboard focus deltas at the search presentation seam", () => {
    expect(searchResultKeyboardFocusDelta("ArrowDown")).toBe(1);
    expect(searchResultKeyboardFocusDelta("ArrowUp")).toBe(-1);
    expect(searchResultKeyboardFocusDelta("Enter")).toBeNull();
    expect(searchResultKeyboardFocusDelta({ key: "ArrowDown" })).toBeNull();
  });

  it("derives the live region and first selectable row from served results", () => {
    expect(
      deriveSearchPresentationView(
        "alpha",
        {
          state: "results",
          results: [hit(null), hit("doc:selectable")],
          semanticOffline: false,
          error: false,
        },
        { target: "code", scope: "scope-a" },
      ),
    ).toEqual({
      rootClassName: "space-y-fg-2 text-body",
      hasQuery: true,
      resultRows: [
        expect.objectContaining({
          key: "x:0",
          nodeId: null,
          species: "unknown",
          source: "x",
          buttonClassName:
            "w-full rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus cursor-default opacity-70",
          excerptClassName: "mt-fg-0-5 block truncate text-ink-muted",
          scoreLabel: "80%",
          scoreToneClass: "text-ink-muted",
          fallbackBadgeLabel: null,
          selectable: false,
          ariaLabel: "x, relevance 80%, no graph node - not selectable",
          entity: expect.objectContaining({
            kind: "search-result",
            id: "x",
            scope: "scope-a",
            source: "x",
            nodeId: undefined,
            score: 0.8,
            isCode: true,
          }),
        }),
        expect.objectContaining({
          key: "doc:selectable",
          nodeId: "doc:selectable",
          species: "doc",
          source: "x",
          buttonClassName:
            "w-full rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus hover:border-rule-strong hover:bg-paper-sunken",
          excerptClassName: "mt-fg-0-5 block truncate text-ink-muted",
          scoreLabel: "80%",
          scoreToneClass: "text-ink-muted",
          fallbackBadgeLabel: null,
          selectable: true,
          ariaLabel: "x, relevance 80%",
          entity: expect.objectContaining({
            kind: "search-result",
            id: "doc:selectable",
            scope: "scope-a",
            source: "x",
            nodeId: "doc:selectable",
            score: 0.8,
            isCode: true,
          }),
        }),
      ],
      showResults: true,
      showLoading: false,
      showSemanticOffline: false,
      showError: false,
      firstClickableIndex: 1,
      noResults: false,
      noResultsMessage: "",
      idleMessage:
        "search semantically across the vault and code. select a result to focus it on the stage.",
      loadingMessage: "searching…",
      semanticOfflineMessage: "",
      errorTitle: "search request failed",
      retryLabel: "try again",
      inputPlaceholder: "Search documents and code…",
      inputAriaLabel: "search query",
      targetGroupAriaLabel: "search target",
      resultsListAriaLabel: "search results",
      resultSummaryLabel: "Ranked by meaning · 2 results",
      liveMessage: "2 results",
      targetGroupClassName: "flex gap-fg-1",
      idleClassName: "px-fg-1 py-fg-2 text-label text-ink-faint",
      loadingClassName:
        "animate-pulse-live px-fg-1 py-fg-0-5 text-label text-ink-faint",
      semanticOfflineClassName:
        "flex items-start gap-fg-1-5 rounded-fg-xs border border-state-stale/40 bg-paper-sunken px-fg-2 py-fg-1 text-label text-ink-muted",
      semanticOfflineIconClassName: "mt-px shrink-0 text-state-stale",
      errorClassName:
        "space-y-fg-1 rounded-fg-xs border border-state-broken/40 px-fg-2 py-fg-1",
      errorTitleClassName: "text-label text-state-broken",
      retryButtonClassName:
        "rounded-fg-xs text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
      noResultsClassName: "px-fg-1 py-fg-2 text-label text-ink-faint",
      resultCountClassName: "px-fg-1 text-caption text-ink-faint",
      resultsListClassName: "space-y-fg-1",
    });
  });

  it("derives result species from stable node ids for chrome icons", () => {
    const rows = deriveSearchPresentationView(
      "alpha",
      {
        state: "results",
        results: [
          hit("doc:a"),
          hit("code:src/app.ts"),
          hit("commit:abc"),
          hit("feature:auth"),
          hit(null),
        ],
        semanticOffline: false,
        error: false,
      },
      { target: "vault", scope: "scope-a" },
    ).resultRows;

    expect(rows.map((row) => row.species)).toEqual([
      "doc",
      "code",
      "commit",
      "unknown",
      "unknown",
    ]);
  });

  it("announces semantic-offline and no-results as controller-owned outcomes", () => {
    const offline = deriveSearchPresentationView("alpha", {
      state: "semantic-offline",
      results: [hit("doc:fallback")],
      semanticOffline: true,
      error: false,
    });

    expect(offline).toMatchObject({
      showLoading: false,
      showSemanticOffline: true,
      showError: false,
      semanticOfflineMessage:
        "semantic search offline — showing title and text matches",
      resultSummaryLabel: "Ranked by text match · 1 result",
      liveMessage: "semantic search offline — showing title and text matches",
    });
    expect(offline.resultRows[0]).toMatchObject({
      scoreToneClass: "text-ink-faint",
      fallbackBadgeLabel: "text match",
    });

    expect(
      deriveSearchPresentationView("alpha", {
        state: "semantic-offline",
        results: [],
        semanticOffline: true,
        noCodeFallback: true,
        error: false,
      }).semanticOfflineMessage,
    ).toBe(
      "semantic search offline — showing title and text matches (vault only; no code fallback available)",
    );

    expect(
      deriveSearchPresentationView("  zzz  ", {
        state: "no-results",
        results: [],
        semanticOffline: false,
        error: false,
      }),
    ).toMatchObject({
      showResults: false,
      showLoading: false,
      showSemanticOffline: false,
      showError: false,
      resultRows: [],
      firstClickableIndex: -1,
      noResults: true,
      noResultsMessage:
        "no matches for “zzz”. try broadening the query or switching target.",
      resultSummaryLabel: "",
      liveMessage: "no results",
    });
  });

  it("keeps transport failure live copy distinct from degraded semantic search", () => {
    expect(
      deriveSearchPresentationView("alpha", {
        state: "error",
        results: [hit()],
        semanticOffline: false,
        error: true,
      }),
    ).toMatchObject({
      showResults: true,
      showLoading: false,
      showSemanticOffline: false,
      showError: true,
      firstClickableIndex: 0,
      noResults: false,
      errorTitle: "search request failed",
      retryLabel: "try again",
      resultSummaryLabel: "Ranked by meaning · 1 result",
      liveMessage: "search request failed",
    });
  });

  it("normalizes runtime query input at the presentation seam", () => {
    expect(
      deriveSearchPresentationView("   ", {
        state: "idle",
        results: [],
        semanticOffline: false,
        error: false,
      }),
    ).toMatchObject({
      hasQuery: false,
      resultRows: [],
      showLoading: false,
      showSemanticOffline: false,
      showError: false,
      noResults: false,
      noResultsMessage: "",
      idleMessage:
        "search semantically across the vault and code. select a result to focus it on the stage.",
      loadingMessage: "searching…",
      liveMessage: "",
    });

    expect(
      deriveSearchPresentationView(
        { query: "zzz" },
        {
          state: "no-results",
          results: [],
          semanticOffline: false,
          error: false,
        },
      ),
    ).toMatchObject({
      hasQuery: false,
      noResultsMessage:
        "no matches for “”. try broadening the query or switching target.",
    });
  });

  it("derives loading state copy for the chrome surface", () => {
    expect(
      deriveSearchPresentationView("alpha", {
        state: "loading",
        results: [],
        semanticOffline: false,
        error: false,
      }),
    ).toMatchObject({
      hasQuery: true,
      showLoading: true,
      showSemanticOffline: false,
      showError: false,
      loadingMessage: "searching…",
      resultSummaryLabel: "",
      liveMessage: "",
    });
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
    expect(JSON.parse(searchBodies[0])).toMatchObject({
      query: "alpha",
      target: "code",
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
