// The document-search plane controller (command-palette-planes ADR, W02.P05;
// search-providers ADR D3). The third Cmd+K plane is a LITERAL name/title finder
// over the corpus the engine already serves — the vault tree — NOT a rag query.
// This is the deliberate split the ADR settled: semantic search answers "what is
// about X", document search answers "where is the thing named X", and keeping the
// finder on the structural tier means it stays fully available when the semantic
// tier is offline (degradation-is-read-from-tiers-not-guessed-from-errors).
//
// It is now a THIN CONSUMER of the ONE files(vault) search provider (search-
// providers ADR D3): the same complete cached vault tree, the same shared literal
// matcher (`literalMatch`), one band policy — two surfaces (this focused finder
// plane and the unified Search palette), zero duplicate scanners. Each match is a
// `SearchResult` carrying the document's graph `node_id`, so the existing
// `SearchResultPill` and the ONE standardized open verb work with no new rendering
// or open path. Bounded by default: the provider caps its own list.

import { useMemo } from "react";

import type { SearchResult } from "./engine";
import { useFilesVaultProvider } from "./searchProviders";

/** The finder's result-list cap — equal to the files(vault) provider's own bound
 *  (the provider enforces it; this names the finder's contract). */
export const DOCUMENT_SEARCH_RESULTS_MAX = 40;

export type DocumentSearchState = "idle" | "loading" | "ready" | "degraded";

export interface DocumentSearchView {
  results: SearchResult[];
  state: DocumentSearchState;
  count: number;
}

export function deriveDocumentSearchState(
  query: string,
  isPending: boolean,
  degraded: boolean,
): DocumentSearchState {
  if (query.trim().length === 0) return "idle";
  if (isPending) return "loading";
  if (degraded) return "degraded";
  return "ready";
}

/**
 * Stores controller for the document-search plane. A thin consumer of the
 * files(vault) provider: it reads the provider's banded entries (the wire access
 * stays in the provider/stores layer), unwraps them to the finder's `SearchResult`
 * list, and derives a bounded, honest view from the provider's own tiers-gated
 * phase. It does not depend on the semantic tier, so it stays available when rag
 * is offline.
 */
export function useDocumentSearchController(
  query: unknown,
  scope: unknown,
): DocumentSearchView {
  const q = typeof query === "string" ? query : "";
  const scopeId = typeof scope === "string" ? scope : null;
  const provider = useFilesVaultProvider(q, scopeId);
  const entries = provider.entries;
  const isPending = provider.state === "loading";
  const degraded = provider.state === "degraded";

  return useMemo(() => {
    const results = entries.map((entry) => entry.result);
    return {
      results,
      state: deriveDocumentSearchState(q, isPending, degraded),
      count: results.length,
    };
  }, [entries, q, isPending, degraded]);
}
