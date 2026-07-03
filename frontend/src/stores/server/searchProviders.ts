// The SearchProvider seam (search-providers ADR D1/D5). One user-facing "Search"
// composes three sources — semantic (rag), files(vault), files(code) — behind a
// single contract, so the Cmd+K palette renders ONE ranked interleaved list
// without knowing which source a hit came from. This module is the CONTRACT: the
// provider shape, the species vocabulary, and the score-band provenance. The three
// concrete providers register in S08; the `useSearchProviders` host that merges
// them registers in S09.
//
// The seam formalizes structure that already exists: the unified controller was a
// two-provider composition (per-corpus semantic controllers behind a pure merge).
// Extraction, not invention — the merge/dedupe/bound/epoch machinery is lifted
// from `searchController` by the host.
//
// Layer law: pure contract types + pure helpers; no fetch, no React, no raw
// `tiers` read here (the host and providers own those).

import { useMemo } from "react";

import { rankLiteralMatches, STRONG_LITERAL_BAND } from "./literalMatch";
import type { CodeFileEntry, SearchResult, VaultTreeEntry } from "./engine";
import { docNodeIdFromStem, stemFromPath } from "./liveAdapters";
import {
  searchResultSpecies,
  useUnifiedSearchController,
  type SearchResultSpecies,
} from "./searchController";
import { useCodeFiles, useVaultTree, useVaultTreeAvailability } from "./queries";

// ── Species vocabulary (ADR D5) ─────────────────────────────────────────────────
//
// The user-facing provider vocabulary IS the entry's SPECIES, derived from its
// node identity — never a mechanism word (rag/semantic/vector). A `doc` renders
// its doc-type word (Research / Decision / …), `code` renders "Code", and the
// reserved `commit` renders "Change" (designed, admitted by the seam, registered
// later without re-architecture). `unknown` is the honest fallback for a hit with
// no navigable node id. Reuses the ONE `SearchResultSpecies` the pill already
// renders (`searchPill.ts`), so the vocabulary cannot fork.

export type SearchSpecies = SearchResultSpecies;
export { searchResultSpecies };

// ── Score bands (ADR D2) ────────────────────────────────────────────────────────
//
// Every entry's score sits in exactly one band, kept as explicit provenance so a
// literal name match never masquerades as semantic certainty NOR is buried by it:
//   - `semantic`       — rag's normalized 0..1 relevance.
//   - `strong-literal` — an exact stem or a stem prefix (0.70..0.95).
//   - `weak-literal`   — a substring match (0.20..0.50).
// The band is derived, never guessed: a literal score at or above the strong band's
// floor is strong, otherwise weak.

export type SearchBand = "semantic" | "strong-literal" | "weak-literal";

/** The literal band a matcher score falls in (the two-tier D2 split). Semantic
 *  scores are NOT classified here — they carry the `semantic` band by provenance
 *  (the provider that produced them), not by threshold. */
export function literalBand(score: number): SearchBand {
  return score >= STRONG_LITERAL_BAND.min ? "strong-literal" : "weak-literal";
}

// ── Provider entry ──────────────────────────────────────────────────────────────

/**
 * One provider hit the host ranks and the pill renders. It carries the wire
 * `result` (whose fields ARE the ADR's entry vocabulary — `title`, `excerpt` as
 * the why-line, `feature` as the feature tag, `node_id`, and the banded `score`),
 * plus the derived `species` and the score's `band` as explicit provenance so the
 * merge can reason about a hit without re-deriving it. Keeping the entry over the
 * existing `SearchResult` means the pill (`deriveSearchPillView`) renders it with
 * no new projection.
 */
export interface SearchProviderEntry {
  result: SearchResult;
  species: SearchSpecies;
  band: SearchBand;
}

/** Wrap a scored result as a provider entry: the species is derived from the
 *  result's node identity, and the band is supplied by the producing provider
 *  (semantic providers pass `"semantic"`; files providers pass the literal band). */
export function toProviderEntry(
  result: SearchResult,
  band: SearchBand,
): SearchProviderEntry {
  return { result, species: searchResultSpecies(result.node_id), band };
}

// ── Provider contract ───────────────────────────────────────────────────────────

/** A provider's own honest phase. `degraded` is a tiers-gated truth (its backing
 *  tier is down but the provider still contributes what it can, or nothing);
 *  `error` is a genuine non-degradation failure. The host collapses the set of
 *  provider states into the one palette phase. */
export type SearchProviderState = "idle" | "loading" | "ready" | "degraded" | "error";

export interface SearchProviderResult {
  /** Stable provider id: `"semantic"` | `"files-vault"` | `"files-code"` (and any
   *  future registration, e.g. a `"change"` commit provider). Identity-bearing —
   *  the host keys per-source state on it. */
  id: string;
  /** The provider's ranked entries, each scored in its own band. */
  entries: SearchProviderEntry[];
  /** The provider's honest phase (tiers-gated for degradation). */
  state: SearchProviderState;
}

/**
 * A SearchProvider is a hook-shaped source over the shared `(query, scope)`: it
 * owns its own fetch/read and degradation, and yields its ranked, banded entries.
 * The host owns everything shared — debounce, merge, dedupe, bound, the semantic
 * epoch — so a provider never re-implements them.
 */
export type SearchProvider = (
  query: string,
  scope: string | null,
) => SearchProviderResult;

// ── Provider ids ────────────────────────────────────────────────────────────────

export const SEMANTIC_PROVIDER_ID = "semantic";
export const FILES_VAULT_PROVIDER_ID = "files-vault";
export const FILES_CODE_PROVIDER_ID = "files-code";

/** Per-provider result cap (bounded-by-default). The host applies the final 40-item
 *  bound over the merged set; each provider caps its own contribution first so a
 *  huge corpus cannot hand the merge an unbounded list. */
export const FILES_PROVIDER_RESULTS_MAX = 40;

// ── Semantic provider (rag /search, both corpora) ───────────────────────────────

/** The final path segment of a path (the code file basename). */
function codeBasename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/**
 * The semantic provider: the existing per-corpus `/search` pair, unchanged wire.
 * It wraps `useUnifiedSearchController` (the vault+code semantic composition) and
 * presents its live, meaning-ranked hits as `semantic`-band entries. Degradation
 * is tiers-gated: when rag is offline the provider contributes NOTHING and reports
 * `degraded` — the files providers keep serving name matches (ADR D2 fold), so the
 * palette degrades to name-matching instead of a dead mode.
 */
export function useSemanticProvider(
  query: string,
  scope: string | null,
): SearchProviderResult {
  const unified = useUnifiedSearchController(query, scope);
  return useMemo(() => {
    const entries = unified.results.map((result) =>
      toProviderEntry(result, "semantic"),
    );
    let state: SearchProviderState;
    if (unified.state === "idle") state = "idle";
    else if (unified.error) state = "error";
    else if (unified.semanticOffline) state = "degraded";
    else if (unified.pending && entries.length === 0) state = "loading";
    else state = "ready";
    return { id: SEMANTIC_PROVIDER_ID, entries, state };
  }, [
    unified.results,
    unified.state,
    unified.error,
    unified.semanticOffline,
    unified.pending,
  ]);
}

// ── files(vault) provider ────────────────────────────────────────────────────────

/** Build a vault literal hit's `SearchResult` (the pill/wire shape): the banded
 *  score, the `doc:{stem}` node id (navigable + species = doc), the H1 title, the
 *  doc-type word source, and the first feature tag for the trailing chip. */
function vaultEntryToResult(entry: VaultTreeEntry, score: number): SearchResult {
  const stem = stemFromPath(entry.path);
  return {
    score,
    source: "vault",
    ...(entry.title ? { title: entry.title } : {}),
    doc_type: entry.doc_type,
    ...(entry.feature_tags[0] ? { feature: entry.feature_tags[0] } : {}),
    node_id: docNodeIdFromStem(stem),
  };
}

/**
 * The files(vault) provider: a literal NAME/title match over the COMPLETE cached
 * vault tree (the rail's already-walked listing), through the one shared matcher.
 * This is the home of the former rag-down text fallback (ADR D2 fold): it is
 * ALWAYS available on the structural tier, so it keeps serving when semantic is
 * offline. Matches over stem, path, title, and feature tags; `degraded` only when
 * the structural tier itself is down (then the tree is genuinely unavailable).
 */
export function useFilesVaultProvider(
  query: string,
  scope: string | null,
): SearchProviderResult {
  const tree = useVaultTree(scope);
  const availability = useVaultTreeAvailability(scope);
  const entries = tree.data?.entries;
  const isPending = tree.isPending;
  const degraded = availability.degraded;
  return useMemo(() => {
    const ranked = rankLiteralMatches(
      query,
      entries ?? [],
      (entry) => ({
        stem: stemFromPath(entry.path),
        path: entry.path,
        title: entry.title,
        tags: entry.feature_tags,
      }),
      FILES_PROVIDER_RESULTS_MAX,
    );
    const providerEntries = ranked.map(({ item, score }) =>
      toProviderEntry(vaultEntryToResult(item, score), literalBand(score)),
    );
    let state: SearchProviderState;
    if (scope === null || query.trim().length === 0) state = "idle";
    else if (degraded) state = "degraded";
    else if (isPending && entries === undefined) state = "loading";
    else state = "ready";
    return { id: FILES_VAULT_PROVIDER_ID, entries: providerEntries, state };
  }, [query, scope, entries, isPending, degraded]);
}

// ── files(code) provider ─────────────────────────────────────────────────────────

/** Build a code literal hit's `SearchResult`: the banded score, the `code:{path}`
 *  node id (navigable + species = code), the file title, and the language. */
function codeEntryToResult(entry: CodeFileEntry, score: number): SearchResult {
  return {
    score,
    source: "codebase",
    ...(entry.title ? { title: entry.title } : {}),
    ...(entry.lang ? { language: entry.lang } : {}),
    node_id: entry.node_id,
  };
}

/**
 * The files(code) provider: a literal name match over the COMPLETE walked
 * code-file listing (`useCodeFiles`), through the same shared matcher. Reachable
 * whenever the code corpus is served; an empty corpus is an honest empty result,
 * never a degraded lie. Matches over the file basename, the full path, and the
 * title.
 */
export function useFilesCodeProvider(
  query: string,
  scope: string | null,
): SearchProviderResult {
  const codeFiles = useCodeFiles(scope);
  const entries = codeFiles.data?.entries;
  const isPending = codeFiles.isPending;
  return useMemo(() => {
    const ranked = rankLiteralMatches(
      query,
      entries ?? [],
      (entry) => ({
        stem: codeBasename(entry.path),
        path: entry.path,
        title: entry.title,
      }),
      FILES_PROVIDER_RESULTS_MAX,
    );
    const providerEntries = ranked.map(({ item, score }) =>
      toProviderEntry(codeEntryToResult(item, score), literalBand(score)),
    );
    let state: SearchProviderState;
    if (scope === null || query.trim().length === 0) state = "idle";
    else if (isPending && entries === undefined) state = "loading";
    else state = "ready";
    return { id: FILES_CODE_PROVIDER_ID, entries: providerEntries, state };
  }, [query, scope, entries, isPending]);
}
