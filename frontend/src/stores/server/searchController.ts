// The rag-search controller (W02.P16.S32, dashboard-rag-search ADR) — the
// stores-layer SOLE wire client for search. This is where the `/search` fetch
// lives, where the degradation truth is READ from the §2 tiers block, where the
// text-match fallback is decided, and where each result carries its graph node
// id for stage click-through. It has NO pixels: its "UI/UX requirements" are the
// honest TRUTHS it exposes so the consuming view (SearchTab) renders correctly.
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
  SearchResult,
  TiersBlock,
  VaultTreeEntry,
} from "./engine";
import { EngineError } from "./engine";
import { docNodeIdFromStem, isRagRunning, stemFromPath } from "./liveAdapters";
import {
  engineKeys,
  useBackendSignalStream,
  useEngineSearch,
  useFiltersVocabulary,
  useVaultTree,
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

// --- pure fallback matching (unit-tested) ------------------------------------------

/**
 * Title/feature-tag match over the already-cached vault tree; earlier, tighter
 * matches score higher. The vault tree is the rail's already-cached tree (no
 * second fetch is forced — `useSearchController` reuses the cached scope tree).
 * Every fallback hit is clickable via its grammar-derived `doc:{stem}` id.
 */
export function buildFallbackResults(
  entries: readonly VaultTreeEntry[] | undefined,
  query: string,
): SearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle || !entries) return [];
  const results: SearchResult[] = [];
  for (const entry of entries) {
    const stem = pathStem(entry.path);
    const haystack = `${stem} ${entry.feature_tags.join(" ")}`.toLowerCase();
    const index = haystack.indexOf(needle);
    if (index === -1) continue;
    results.push({
      // Earlier, tighter matches score higher; the band stays below 1 so a
      // fallback score never masquerades as a semantic certainty (search ADR:
      // "the fallback score band stays below semantic certainty").
      score: Math.max(0.1, 0.9 - index / Math.max(1, haystack.length)),
      source: stem,
      excerpt: `${entry.doc_type} · #${entry.feature_tags.join(" #")}`,
      node_id: pathToDocNodeId(entry.path),
    });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 20);
}

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
  if (!block) return false;
  const semantic = block.semantic;
  return semantic === undefined || semantic.available === false;
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
// so the retained accumulator also carries `git` chunks; `ragWordOf` ignores any
// chunk without a `rag` field (every git frame), so the latest rag-bearing frame
// is still a `backends` `{ rag?: <lifecycle> }` frame; rag is available only when the word is exactly
// "running", tested through the shared `isRagRunning` predicate (the one stores-
// layer home `adaptStatus`/`deriveRagStatusView` also route through — no local
// re-implementation to drift). We read the MOST-RECENT such frame BY VALUE rather
// than counting accumulator
// length, because `streamReducer` ring-caps the accumulator at STREAM_RETENTION —
// a length-based detector silently stops firing once the stream saturates, so a
// recovered rag would stay pinned to the text-match fallback for the rest of the
// session. A value-based read survives the ring cap unchanged.

/** The rag lifecycle word from a single retained stream chunk, if it carries one. */
function ragWordOf(chunk: { data: unknown }): string | undefined {
  const data = chunk.data;
  if (data && typeof data === "object" && "rag" in data) {
    const word = (data as { rag?: unknown }).rag;
    if (typeof word === "string") return word;
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
  chunks: readonly { data: unknown }[] | undefined,
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
  /**
   * Code-target offline has no fallback corpus: when semantic is offline AND the
   * target is `code`, this is true and `results` is empty — the view renders the
   * explicit "semantic search offline, no fallback for code" notice rather than a
   * misleading empty result (search ADR "The rag-down path").
   */
  noCodeFallback: boolean;
  /** A query is in flight with no held results to show. */
  pending: boolean;
  /** A genuine, non-degradation transport failure the operator can retry. */
  error: boolean;
  /** The engine-enumerated filter vocabulary forwarded intact (search ADR
   *  "Filter vocabulary") — the data-driven legal facets; never hardcoded. */
  filterVocabulary: FiltersVocabulary | undefined;
  /** Re-run the semantic query (the error state's retry affordance). */
  retry: () => void;
}

/**
 * Interpret a search query's outcome into the controller view. Pure over the
 * inputs so the full state machine is unit-testable without a render: the tiers
 * gate decides `semantic-offline`, the fallback is served only for the vault
 * target, the code target degrades to an explicit no-fallback state, and a
 * tiers-less transport fault is the `error` branch (held results stay visible
 * under the banner — a transient refetch failure must not blank a list the
 * operator was reading; TanStack retains `data` across an error and result ids
 * are stable, contract §2).
 */
export function interpretSearch(input: {
  query: string;
  target: "vault" | "code";
  data: { results: SearchResult[]; tiers?: TiersBlock } | undefined;
  error: unknown;
  isPending: boolean;
  fallbackEntries: readonly VaultTreeEntry[] | undefined;
  fallbackPending: boolean;
  filterVocabulary: FiltersVocabulary | undefined;
  retry: () => void;
}): SearchControllerView {
  const {
    query,
    target,
    data,
    error,
    isPending,
    fallbackEntries,
    fallbackPending,
    filterVocabulary,
    retry,
  } = input;

  const semanticOffline = isSemanticOffline(error, data?.tiers);
  const transportError = !semanticOffline && isTransportError(error);
  const hasQuery = query.trim().length > 0;

  // Idle: empty query, no request (the disabled state).
  if (!hasQuery) {
    return {
      state: "idle",
      results: [],
      semanticOffline: false,
      noCodeFallback: false,
      pending: false,
      error: false,
      filterVocabulary,
      retry,
    };
  }

  // Semantic offline (tiers-gated): rag is down per the wire's tiers block.
  if (semanticOffline) {
    const fallback =
      target === "vault" ? buildFallbackResults(fallbackEntries, query) : [];
    const noCodeFallback = target === "code";
    const pending = target === "vault" && fallbackPending;
    return {
      state: "semantic-offline",
      results: fallback,
      semanticOffline: true,
      noCodeFallback,
      pending,
      error: false,
      filterVocabulary,
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
      noCodeFallback: false,
      pending: false,
      error: true,
      filterVocabulary,
      retry,
    };
  }

  // In flight with no held data: the loading state.
  if (isPending && data === undefined) {
    return {
      state: "loading",
      results: [],
      semanticOffline: false,
      noCodeFallback: false,
      pending: true,
      error: false,
      filterVocabulary,
      retry,
    };
  }

  const results = data?.results ?? [];
  return {
    state: results.length > 0 ? "results" : "no-results",
    results,
    semanticOffline: false,
    noCodeFallback: false,
    pending: isPending && data === undefined,
    error: false,
    filterVocabulary,
    retry,
  };
}

// --- the controller hook ------------------------------------------------------------

/** Debounce window for the keystroke stream (search ADR "Query lifecycle"): a
 *  fast typist does not fan out a request per character. The trailing edge issues
 *  one query once typing settles. */
export const SEARCH_DEBOUNCE_MS = 200;

/**
 * The rag-search controller: the SINGLE interpreted search selector the view
 * consumes. It debounces the keystroke stream so the keyed query only issues on
 * the settled term; cancels/abandons the superseded query (TanStack keys by
 * `(target, query)`, so a stale key's in-flight request is abandoned and a slow
 * earlier response never overwrites a newer one); disables while the input is
 * empty; reuses the rail's already-cached vault tree for the text-match fallback
 * (no second fetch); and invalidates the search cache on a rag-health transition
 * over the §7 `backends` stream so a rag-came-back transition lets a previously
 * degraded query re-issue against the live semantic tier.
 *
 * Scope-change invalidation is structural: the cache key is `(target, query)` and
 * a new worktree is a new corpus reached under a new scope — the fallback tree the
 * controller reads is keyed by scope, so switching scope re-reads the live tree;
 * and the rag-health transition (below) re-issues the query. The view passes the
 * active scope so the fallback tree resolves the right corpus.
 */
export function useSearchController(
  rawQuery: string,
  target: "vault" | "code",
  scope: string | null,
): SearchControllerView {
  const queryClient = useQueryClient();

  // Debounce the keystroke stream onto a settled term: the keyed query issues
  // only once typing pauses, so a fast typist does not fan out one request per
  // character. The superseded key's in-flight request is abandoned by TanStack
  // (it is no longer observed), so a slow earlier response never overwrites a
  // newer one.
  const [debouncedQuery, setDebouncedQuery] = useState(rawQuery);
  const setDebounced = useMemo(
    () => debounce((value: string) => setDebouncedQuery(value), SEARCH_DEBOUNCE_MS),
    [],
  );
  useEffect(() => {
    // An empty query settles immediately (the idle state is not a request worth
    // waiting on); a non-empty term debounces.
    if (rawQuery.trim().length === 0) {
      setDebounced.cancel();
      setDebouncedQuery(rawQuery);
    } else {
      setDebounced(rawQuery);
    }
  }, [rawQuery, setDebounced]);
  useEffect(() => () => setDebounced.cancel(), [setDebounced]);

  const semantic = useEngineSearch(debouncedQuery, target);
  const semanticOffline = isSemanticOffline(semantic.error, semantic.data?.tiers);

  // The fallback reuses the rail's already-cached vault tree; fetch it only when
  // the tiers gate says rag is down (no speculative fetch when search is live).
  const tree = useVaultTree(semanticOffline ? scope : null);

  // The filter vocabulary forwarded intact (search ADR "Filter vocabulary"):
  // rag's own vocabulary surfaced as the data-driven legal facet set, scoped to
  // the active worktree. The controller carries it; it does not author it.
  const filters = useFiltersVocabulary(scope);

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
    query: debouncedQuery,
    target,
    data: semantic.data,
    error: semantic.error,
    isPending: debouncedQuery.length > 0 && semantic.isPending,
    fallbackEntries: tree.data?.entries,
    fallbackPending: tree.isPending,
    filterVocabulary: filters.data,
    retry,
  });
}
