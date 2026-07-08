// The rag-search controller (W02.P16.S32, dashboard-rag-search ADR) — the
// stores-layer SOLE wire client for search. This is where the `/search` fetch
// lives, where the degradation truth is READ from the §2 tiers block, where the
// text-match fallback is decided, and where each result carries its graph node
// id for stage click-through. It has NO pixels: its "UI/UX requirements" are the
// honest TRUTHS it exposes so the consuming view (the Cmd-K search palette,
// `SearchPaletteSurface`) renders correctly.
//
// Boundary correction (dashboard-layer-ownership / search ADR "Layer ownership"):
// the rag-down fallback previously lived under `frontend/src/app/right/`, the
// CHROME layer, yet it composed `useEngineSearch` + `useVaultTree` and decided
// the semantic-offline truth — wire-client behaviour living in a view directory.
// That decision is pulled back HERE into the stores slice, leaving the view a
// dumb consumer of ONE interpreted search selector.
//
// Degradation is TIERS-GATED truth, never guessed (search ADR "Degradation is
// tiers-gated truth"): semantic-offline is derived from `tiers.semantic.available`
// the wire carries — the rag 502 error envelope OR the success-envelope tier
// block — never from a bare transport error or timeout. The fallback to text
// match is gated on that truth and scored in a band STRICTLY below semantic
// certainty so a text match never masquerades as a semantic hit.

import { useEffect, useMemo, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { debounce } from "../../platform/timing";
import type {
  FiltersVocabulary,
  SearchIndexState,
  SearchResult,
  TiersBlock,
} from "./engine";
import { EngineError, readTierAvailability } from "./engine";
import { docNodeIdFromStem, isRagRunning, stemFromPath } from "./liveAdapters";
import {
  engineKeys,
  normalizeBackendSignalChannel,
  useBackendSignalStream,
  useEngineSearch,
  useFiltersVocabulary,
  normalizeSearchRequestIdentity,
  type SearchRequestIdentity,
} from "./queries";

// --- node-id grammar (stores-owned, §2 identity) -----------------------------------
//
// The `doc:{stem}` grammar has ONE stores-layer home: `stemFromPath` /
// `docNodeIdFromStem` in liveAdapters, the same pair `deriveSearchNodeId` derives a
// live hit's id through (centralisation audit L2). These thin wrappers preserve the
// fallback's existing call shape while consuming that single grammar, so the
// controller never re-implements the strip-dir-and-`.md` regex and never reaches up
// into a chrome helper for it (the old fallback imported `pathToNodeId` from
// `app/left/`, an upward dependency the boundary correction removes).

/** Vault path → its canonical stem (filename without directory or `.md`). */
export function pathStem(path: string): string {
  return stemFromPath(path);
}

/** Vault path → the contract's document node id (`doc:{stem}`). */
export function pathToDocNodeId(path: string): string {
  return docNodeIdFromStem(stemFromPath(path));
}

// The rag-down TEXT FALLBACK retired here (search-providers ADR D2 fold): a
// semantic outage is no longer a mode with its own text-match results. The
// `files(vault)` search provider — the ONE shared literal matcher over the
// complete cached vault tree — now carries name matches whether or not rag is up,
// so this controller stays PURELY semantic and only exports the tiers-gated
// `semanticOffline` truth for the host to gate on. `pathStem`/`pathToDocNodeId`
// above remain the stores-layer `doc:{stem}` grammar wrappers.

// --- degradation seam (pure, tiers-gated, unit-tested) -----------------------------

/**
 * Whether the `semantic` tier is offline given the search query's outcome. The
 * canonical signal is the §2 tiers block the engine attaches to its envelope:
 * `semantic.available === false`, OR the tier being absent from a block the
 * engine actually served, is "rag is down" — a designed degraded state. A
 * structured rag-down error (an `EngineError` carrying that block) is degradation
 * even when its HTTP status is 502; a transport fault with NO structured envelope
 * is NOT degradation (it is the genuine error state). Absence-of-tier is
 * degradation; a bare transport failure is an error — the search ADR's two
 * distinct truths, never conflated.
 *
 * Precedence: when a tiers-bearing ERROR envelope is present it is the FRESHEST
 * wire truth and wins over the (possibly stale) `tiers` of a prior success
 * TanStack still holds on the key — a fresh rag-down 502 arriving after an
 * earlier healthy response must degrade, not be masked by the held success block.
 */
export function isSemanticOffline(
  error: unknown,
  tiers: TiersBlock | undefined,
): boolean {
  const errorTiers = error instanceof EngineError ? error.tiers : undefined;
  const block = errorTiers ?? tiers;
  return block !== undefined && readTierAvailability(block, ["semantic"]).degraded;
}

/** True only for a genuine transport failure that carries NO tiers envelope —
 *  the "your request failed" state, distinct from tier degradation. */
export function isTransportError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof EngineError) return error.tiers === undefined;
  return true;
}

// --- rag-health transition detector (value-based, ring-cap safe) --------------------
//
// The §7 `backends` stream reports each backend's lifecycle word. The search
// controller now reads the SHARED backend-signal stream (backends + git, F-M1),
// so the retained accumulator also carries `git` chunks; `ragWordOf` first gates
// on the normalized backend-signal channel, so only `backends` frames can report
// a rag lifecycle word. Rag is available only when the word is exactly
// "running", tested through the shared `isRagRunning` predicate (the one stores-
// layer home `adaptStatus`/`deriveRagStatusView` also route through — no local
// re-implementation to drift). We read the MOST-RECENT such frame BY VALUE rather
// than counting accumulator
// length, because `streamReducer` ring-caps the accumulator at STREAM_RETENTION —
// a length-based detector silently stops firing once the stream saturates, so a
// recovered rag would stay pinned to the text-match fallback for the rest of the
// session. A value-based read survives the ring cap unchanged.

export const SEARCH_RAG_LIFECYCLE_WORD_MAX_CHARS = 64;

export function normalizeSearchRagLifecycleWord(word: unknown): string | undefined {
  if (typeof word !== "string") return undefined;
  const normalized = word.trim();
  return normalized.length > 0 &&
    normalized.length <= SEARCH_RAG_LIFECYCLE_WORD_MAX_CHARS
    ? normalized
    : undefined;
}

/** The rag lifecycle word from a single retained stream chunk, if it carries one. */
function ragWordOf(chunk: { channel?: unknown; data: unknown }): string | undefined {
  if (normalizeBackendSignalChannel(chunk.channel) !== "backends") {
    return undefined;
  }
  const data = chunk.data;
  if (data && typeof data === "object" && "rag" in data) {
    return normalizeSearchRagLifecycleWord((data as { rag?: unknown }).rag);
  }
  return undefined;
}

/**
 * Rag availability from the LATEST `backends` frame in the retained accumulator,
 * or `undefined` when no rag-bearing frame has arrived yet (so the caller can
 * guard the initial state and not treat "no frame" as a transition). Robust to
 * the STREAM_RETENTION ring cap: it reads the newest carried value, never a
 * monotonically-growing count. Available iff the lifecycle word is exactly
 * "running" (the shared `isRagRunning` predicate).
 */
export function latestBackendsRagAvailable(
  chunks: readonly { channel?: unknown; data: unknown }[] | undefined,
): boolean | undefined {
  if (!chunks) return undefined;
  for (let i = chunks.length - 1; i >= 0; i--) {
    const word = ragWordOf(chunks[i]);
    if (word !== undefined) return isRagRunning(word);
  }
  return undefined;
}

// --- the interpreted controller view ------------------------------------------------

/**
 * The explicit states the controller models (search ADR "The states it models"),
 * each a distinct, honest state the view renders deterministically:
 * - `idle`            — empty query, no request.
 * - `loading`         — a query in flight with no held results.
 * - `results`         — ranked hits served.
 * - `no-results`      — a successful search with zero hits (distinct from offline).
 * - `semantic-offline`— rag down per the tiers block; serving the text-match
 *                       fallback for vault, an explicit no-fallback note for code.
 * - `error`           — a genuine transport/request failure (still carries tiers).
 */
export type SearchState =
  | "idle"
  | "loading"
  | "results"
  | "no-results"
  | "semantic-offline"
  | "error";

export interface SearchControllerView {
  /** The single interpreted phase the view switches on. */
  state: SearchState;
  /** The ranked hits (semantic when live, text-match when degraded for vault). */
  results: SearchResult[];
  /** True while serving text-match instead of semantic search — read from the
   *  tiers seam, NEVER a bare `isError` (search ADR degradation row). */
  semanticOffline: boolean;
  /** A query is in flight with no held results to show. */
  pending: boolean;
  /** A genuine, non-degradation transport failure the operator can retry. */
  error: boolean;
  /** The engine-enumerated filter vocabulary forwarded intact (search ADR
   *  "Filter vocabulary") — the data-driven legal facets; never hardcoded. */
  filterVocabulary: FiltersVocabulary | undefined;
  /**
   * rag's freshness block for this corpus as SERVED (rag-integration-hardening
   * ADR D3), forwarded raw for the consumer to render staleness from — never
   * remapped here (presentation maps the served token to a label). The reference
   * is passed through unchanged from the held `SearchResponse` so its identity is
   * stable across renders (frontend-store-selectors: no fresh reference minted).
   * `undefined` when the wire carried no `index_state` (idle / loading / a
   * degraded or empty search).
   */
  indexState: SearchIndexState | undefined;
  /**
   * The shared D4 semantic-index epoch as served: a number when the engine's
   * short-TTL cache was warm, `null` when it marked freshness unknown (honest
   * known-unknown), `undefined` when the wire carried none. Consumers key caches
   * on this value across the search and embeddings planes; `null` and `undefined`
   * are distinct and never collapsed.
   */
  semanticEpoch: number | null | undefined;
  /** Re-run the semantic query (the error state's retry affordance). */
  retry: () => void;
}

export type SearchResultSpecies = "doc" | "code" | "commit" | "unknown";

export function searchResultSpecies(nodeId: string | null): SearchResultSpecies {
  if (nodeId === null) return "unknown";
  if (nodeId.startsWith("commit:")) return "commit";
  if (nodeId.startsWith("code:")) return "code";
  if (nodeId.startsWith("doc:")) return "doc";
  return "unknown";
}

/**
 * Interpret a search query's outcome into the controller view. Pure over the
 * inputs so the full state machine is unit-testable without a render: the tiers
 * gate decides `semantic-offline` (now a PURELY semantic phase — the text
 * fallback folded into the files(vault) search provider, ADR D2), and a
 * tiers-less transport fault is the `error` branch (held results stay visible
 * under the banner — a transient refetch failure must not blank a list the
 * operator was reading; TanStack retains `data` across an error and result ids
 * are stable, contract §2).
 */
export function interpretSearch(input: {
  query: string;
  target: "vault" | "code";
  enabled?: boolean;
  data:
    | {
        results: SearchResult[];
        tiers?: TiersBlock;
        index_state?: SearchIndexState;
        semantic_epoch?: number | null;
      }
    | undefined;
  error: unknown;
  isPending: boolean;
  filterVocabulary: FiltersVocabulary | undefined;
  retry: () => void;
}): SearchControllerView {
  const {
    query,
    enabled = true,
    data,
    error,
    isPending,
    filterVocabulary,
    retry,
  } = input;

  const semanticOffline = isSemanticOffline(error, data?.tiers);
  const transportError = !semanticOffline && isTransportError(error);
  const hasQuery = query.trim().length > 0;

  // Served freshness (ADR D3), forwarded RAW from the held response — the
  // `index_state` reference is passed through unchanged (never cloned) so its
  // identity is stable across renders, and the epoch is a primitive. Both ride
  // every non-idle branch; idle is not an active search, so it reports neither.
  const indexState = data?.index_state;
  const semanticEpoch = data?.semantic_epoch;

  // Idle: empty query or scope-less controller, no request.
  if (!enabled || !hasQuery) {
    return {
      state: "idle",
      results: [],
      semanticOffline: false,
      pending: false,
      error: false,
      filterVocabulary,
      indexState: undefined,
      semanticEpoch: undefined,
      retry,
    };
  }

  // Semantic offline (tiers-gated): rag is down per the wire's tiers block. This
  // controller now contributes NOTHING when offline (results empty) — the
  // files(vault) provider carries name matches in the host merge (ADR D2 fold).
  // The exported `semanticOffline` truth is what the host gates its degraded copy
  // on; there is no per-target fallback distinction anymore.
  if (semanticOffline) {
    return {
      state: "semantic-offline",
      results: [],
      semanticOffline: true,
      pending: false,
      error: false,
      filterVocabulary,
      indexState,
      semanticEpoch,
      retry,
    };
  }

  // Genuine transport failure (no tiers envelope): the error state. KEEP the last
  // successful results visible under the banner + retry (search ADR error state:
  // "recoverable, plainly-worded, with retry") — a transient refetch error must
  // not blank a list the operator was reading.
  if (transportError) {
    return {
      state: "error",
      results: data?.results ?? [],
      semanticOffline: false,
      pending: false,
      error: true,
      filterVocabulary,
      indexState,
      semanticEpoch,
      retry,
    };
  }

  // In flight with no held data: the loading state.
  if (isPending && data === undefined) {
    return {
      state: "loading",
      results: [],
      semanticOffline: false,
      pending: true,
      error: false,
      filterVocabulary,
      indexState,
      semanticEpoch,
      retry,
    };
  }

  const results = data?.results ?? [];
  return {
    state: results.length > 0 ? "results" : "no-results",
    results,
    semanticOffline: false,
    pending: isPending && data === undefined,
    error: false,
    filterVocabulary,
    indexState,
    semanticEpoch,
    retry,
  };
}

// --- the controller hook ------------------------------------------------------------

/** Debounce window for the keystroke stream (search ADR "Query lifecycle"): a
 *  fast typist does not fan out a request per character. The trailing edge issues
 *  one query once typing settles. */
export const SEARCH_DEBOUNCE_MS = 200;

function sameSearchRequest(
  a: SearchRequestIdentity,
  b: SearchRequestIdentity,
): boolean {
  return a.query === b.query && a.target === b.target && a.scope === b.scope;
}

/**
 * The rag-search controller: the SINGLE interpreted search selector the view
 * consumes. It debounces the keystroke stream so the keyed query only issues on
 * the settled term; cancels/abandons the superseded query (TanStack keys by
 * `(scope, target, query)`, so a stale key's in-flight request is abandoned and a
 * slow earlier response never overwrites a newer one); disables while the input is
 * empty or scope-less; reuses the rail's already-cached vault tree for the
 * text-match fallback (no second fetch); and invalidates the search cache on a
 * rag-health transition over the §7 `backends` stream so a rag-came-back
 * transition lets a previously degraded query re-issue against the live semantic
 * tier. Scope is part of the key and request body because search results are
 * corpus-specific.
 */
export function useSearchController(
  rawQuery: unknown,
  target: unknown,
  scope: unknown,
): SearchControllerView {
  const queryClient = useQueryClient();
  const requestedSearch = useMemo(
    () => normalizeSearchRequestIdentity(rawQuery, target, scope),
    [rawQuery, target, scope],
  );

  // Debounce the keystroke stream onto a settled term: the keyed query issues
  // only once typing pauses, so a fast typist does not fan out one request per
  // character. The superseded key's in-flight request is abandoned by TanStack
  // (it is no longer observed), so a slow earlier response never overwrites a
  // newer one. Scope + target are part of the settled request identity too, so a
  // scope/target switch cannot fire the previous term against the new corpus.
  const [settledSearch, setSettledSearch] =
    useState<SearchRequestIdentity>(requestedSearch);
  const setDebounced = useMemo(
    () =>
      debounce(
        (value: SearchRequestIdentity) => setSettledSearch(value),
        SEARCH_DEBOUNCE_MS,
      ),
    [],
  );
  useEffect(() => {
    // An empty query settles immediately (the idle state is not a request worth
    // waiting on); a non-empty term debounces.
    if (requestedSearch.query.length === 0) {
      setDebounced.cancel();
      setSettledSearch(requestedSearch);
    } else {
      setDebounced(requestedSearch);
    }
  }, [requestedSearch, setDebounced]);
  useEffect(() => () => setDebounced.cancel(), [setDebounced]);

  const requestSettled = sameSearchRequest(settledSearch, requestedSearch);
  const activeSearch = requestSettled ? settledSearch : requestedSearch;
  const activeScope = requestSettled ? settledSearch.scope : null;
  const semantic = useEngineSearch(
    activeScope,
    activeSearch.query,
    activeSearch.target,
  );
  const semanticData = requestSettled ? semantic.data : undefined;
  const semanticError = requestSettled ? semantic.error : undefined;

  // The filter vocabulary forwarded intact (search ADR "Filter vocabulary"):
  // rag's own vocabulary surfaced as the data-driven legal facet set, scoped to
  // the active search worktree. It follows the settled search identity so the
  // interpreted controller view cannot mix held results/fallback from one scope
  // with vocabulary from a newer, still-debouncing scope.
  const filters = useFiltersVocabulary(activeScope);

  // Rag-health invalidation (search ADR "Caching and invalidation"): a rag-came-
  // back transition over the §7 `backends` stream must let a previously degraded
  // query re-issue against the live semantic tier rather than stay pinned to its
  // fallback. Debounced so a flapping backend bursts one trailing invalidation,
  // not one per event (mirrors NowStrip's recovery-refetch debounce).
  //
  // Detected BY VALUE, not accumulator length: `streamReducer` ring-caps the
  // accumulator at STREAM_RETENTION, so a length-based edge detector silently
  // dies once the stream saturates (length pins forever → every later transition
  // dropped → a recovered rag stays pinned to the fallback for the rest of the
  // session). Reading the latest `backends` frame's rag availability and firing
  // only when that boolean FLIPS is robust to the ring cap and also removes the
  // spurious per-frame invalidation a length detector caused.
  const stream = useBackendSignalStream();
  const invalidateSearch = useMemo(
    () =>
      debounce(() => {
        void queryClient.invalidateQueries({
          queryKey: [...engineKeys.all, "search"],
        });
      }, 150),
    [queryClient],
  );
  useEffect(() => () => invalidateSearch.cancel(), [invalidateSearch]);
  const ragAvailable = latestBackendsRagAvailable(stream.data);
  const priorRagAvailable = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (ragAvailable === undefined) return; // no backends frame yet — nothing to compare
    const prior = priorRagAvailable.current;
    priorRagAvailable.current = ragAvailable;
    // Only a genuine FLIP (including the first observed value, prior=undefined)
    // invalidates. A repeated same-availability frame is a no-op, so a flapping
    // backend that re-reports the same state does not storm invalidations.
    if (prior !== ragAvailable) invalidateSearch();
  }, [ragAvailable, invalidateSearch]);

  const retry = useMemo(() => () => void semantic.refetch(), [semantic]);

  return interpretSearch({
    query: activeSearch.query,
    target: activeSearch.target,
    enabled: requestedSearch.scope !== null,
    data: semanticData,
    error: semanticError,
    isPending:
      activeSearch.query.trim().length > 0 && (!requestSettled || semantic.isPending),
    filterVocabulary: requestSettled ? filters.data : undefined,
    retry,
  });
}

// --- unified (vault + code) search for the Cmd-K palette -----------------------------
//
// The command palette's search mode (figma SearchPalette/List 651:1771) shows ONE
// mixed-species result list — Doc, Code, and Change pills interleaved — but the
// `/search` wire is per-corpus (vault OR code). The unified controller composes the
// two corpus controllers and merges their ranked hits by score into a single list,
// so the palette renders the binding Figma design without a target toggle. The merge
// is pure (`mergeUnifiedSearch`) so the ranking + state collapse is unit-testable.

/** Upper bound on the merged result list (bounded-by-default-for-every-accumulator):
 *  the palette renders a bounded slice even when both corpora return their caps. */
export const UNIFIED_SEARCH_RESULTS_MAX_ITEMS = 40;

export interface UnifiedSearchView {
  /** The single interpreted phase the palette switches on. */
  state: SearchState;
  /** The merged, score-ranked hits across both corpora (bounded). */
  results: SearchResult[];
  /** True when EITHER corpus reports its semantic tier offline (tiers-gated). */
  semanticOffline: boolean;
  /** A query is in flight with no merged results to show yet. */
  pending: boolean;
  /** Both corpora failed with a genuine (non-degradation) transport error. */
  error: boolean;
  /**
   * The shared D4 semantic-index epoch as served (rag-integration-hardening ADR
   * D3). Both corpora query the same engine at one generation, so the epoch is a
   * single shared value across the search and embeddings planes; the merge
   * forwards it raw (a number when warm, `null` when freshness is known-unknown,
   * `undefined` when unserved) so the palette and downstream builds key one
   * invalidation on it. Per-corpus `index_state` detail stays on the composed
   * single-target controllers, which describe distinct corpora.
   */
  semanticEpoch: number | null | undefined;
  /** Re-run both corpus queries (the error state's retry affordance). */
  retry: () => void;
}

/**
 * Collapse the two corpus epochs into the one shared value. Both corpora hit the
 * same engine short-TTL epoch cache, so they agree in the common case; prefer a
 * concrete number, then the honest known-unknown `null`, then unserved
 * `undefined`. `null` and `undefined` are never collapsed.
 */
export function mergeSemanticEpoch(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null | undefined {
  if (typeof a === "number") return a;
  if (typeof b === "number") return b;
  if (a === null || b === null) return null;
  return undefined;
}

/**
 * Collapse the two corpus controller views into one unified palette view. Results
 * are concatenated and sorted by descending score (stable across equal scores) and
 * bounded; the state is the honest collapse of the pair — results win, then
 * loading, then idle, then the degradation/error/no-results truths.
 */
/** A stable identity for a search hit, used to collapse duplicates across (and
 *  within) the two corpora. Prefers the graph `node_id`; falls back to the wire
 *  title, then the source+excerpt, so a null-node_id code chunk that recurs (the
 *  rag code index can return several chunks of one file) appears once. */
export function unifiedResultIdentity(result: SearchResult): string {
  if (result.node_id !== null) return `n:${result.node_id}`;
  if (result.title && result.title.trim().length > 0) return `t:${result.title}`;
  return `s:${result.source}:${result.excerpt ?? ""}`;
}

export function mergeUnifiedSearch(
  vault: SearchControllerView,
  code: SearchControllerView,
  retry: () => void,
): UnifiedSearchView {
  const ranked = [...vault.results, ...code.results].sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const result of ranked) {
    const identity = unifiedResultIdentity(result);
    if (seen.has(identity)) continue;
    seen.add(identity);
    results.push(result);
    if (results.length >= UNIFIED_SEARCH_RESULTS_MAX_ITEMS) break;
  }
  const semanticOffline = vault.semanticOffline || code.semanticOffline;
  const pending = vault.pending || code.pending;
  const bothIdle = vault.state === "idle" && code.state === "idle";
  const bothError = vault.error && code.error;

  let state: SearchState;
  if (results.length > 0) {
    state = "results";
  } else if (pending) {
    state = "loading";
  } else if (bothIdle) {
    state = "idle";
  } else if (bothError) {
    state = "error";
  } else if (semanticOffline) {
    state = "semantic-offline";
  } else {
    state = "no-results";
  }

  return {
    state,
    results,
    semanticOffline,
    pending,
    error: bothError,
    semanticEpoch: mergeSemanticEpoch(vault.semanticEpoch, code.semanticEpoch),
    retry,
  };
}

/**
 * The unified search controller the Cmd-K palette consumes: it runs the vault and
 * code corpus controllers over the same query/scope and merges their ranked hits.
 * Each composed controller keeps its own debounce, degradation gate, and rag-health
 * invalidation; this hook only collapses the pair. Scope-less (no active worktree)
 * is the idle state via the underlying controllers.
 */
export function useUnifiedSearchController(
  rawQuery: unknown,
  scope: unknown,
  corpus: "all" | "docs" | "code" = "all",
): UnifiedSearchView {
  // Corpus separation (search palette scope control): an excluded target reads
  // an EMPTY query, which is the controller's idle state — its wire query is
  // disabled entirely, never fetched-and-discarded.
  const vault = useSearchController(corpus === "code" ? "" : rawQuery, "vault", scope);
  const code = useSearchController(corpus === "docs" ? "" : rawQuery, "code", scope);
  const retry = useMemo(
    () => () => {
      vault.retry();
      code.retry();
    },
    [vault, code],
  );
  return mergeUnifiedSearch(vault, code, retry);
}
