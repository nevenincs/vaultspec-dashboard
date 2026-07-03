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

import { STRONG_LITERAL_BAND } from "./literalMatch";
import type { SearchResult } from "./engine";
import { searchResultSpecies, type SearchResultSpecies } from "./searchController";

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
