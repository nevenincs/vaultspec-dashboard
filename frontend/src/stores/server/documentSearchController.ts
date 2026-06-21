// The document-search plane controller (command-palette-planes ADR, W02.P05). The
// third Cmd+K plane is a LITERAL name/title finder over the corpus the engine already
// serves — the vault tree (`useVaultTree`, the structural tier) — NOT a rag query.
// This is the deliberate split the ADR settled (open question O2): semantic search
// answers "what is about X" (rag), document search answers "where is the thing named
// X" (literal), and keeping the literal finder on the structural tier means it stays
// fully available when the semantic tier is offline
// (degradation-is-read-from-tiers-not-guessed-from-errors).
//
// Each match is emitted as a `SearchResultEntity`, so the existing SearchResultPill
// and the ONE standardized open verb (`openEntityAction` / the search-result
// resolver) work for a document hit with no new rendering or open path.
//
// Bounded by default (bounded-by-default-for-every-accumulator): the result list is
// capped regardless of corpus size.

import { useMemo } from "react";

import type { SearchResult, VaultTreeEntry } from "./engine";
import { docNodeIdFromStem, stemFromPath } from "./liveAdapters";
import { useVaultTree, useVaultTreeAvailability } from "./queries";

/** Upper bound on the document-search result list the palette renders. */
export const DOCUMENT_SEARCH_RESULTS_MAX = 40;

export type DocumentSearchState = "idle" | "loading" | "ready" | "degraded";

export interface DocumentSearchView {
  results: SearchResult[];
  state: DocumentSearchState;
  count: number;
}

const RANK_SCORE = [1, 0.8, 0.6] as const;

/**
 * Pure literal match over vault-tree entries: every whitespace-separated query token
 * must appear in the entry's stem, path, or doc-type (case-insensitive). Results are
 * ranked stem-prefix > stem-substring > path-substring, then bounded. Each result is
 * emitted in the wire `SearchResult` shape — same as the unified semantic controller —
 * carrying the document's graph `node_id`, so `deriveSearchPillViews`, the
 * `SearchResultPill`, the search-result context menu, and the ONE standardized open
 * verb all work for a document hit with no new rendering or open path.
 */
export function matchDocumentEntries(
  entries: readonly VaultTreeEntry[] | undefined,
  query: string,
  cap: number = DOCUMENT_SEARCH_RESULTS_MAX,
): SearchResult[] {
  const needle = typeof query === "string" ? query.trim().toLowerCase() : "";
  if (!Array.isArray(entries) || needle.length === 0) return [];
  const tokens = needle.split(/\s+/).filter(Boolean);
  const scored: { result: SearchResult; rank: number; stem: string }[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const path = typeof entry?.path === "string" ? entry.path : "";
    if (path.length === 0 || seen.has(path)) continue;
    const stem = stemFromPath(path);
    const stemLower = stem.toLowerCase();
    const haystack = `${stemLower} ${path.toLowerCase()} ${(entry.doc_type ?? "").toLowerCase()}`;
    if (!tokens.every((token) => haystack.includes(token))) continue;
    seen.add(path);
    // Every vault entry is matched, including doc types that are not served as graph
    // nodes (index/steps). Their `doc:` id opens the DOM island by stem through the
    // open-island contract (content resolves by stem, independent of graph presence);
    // graph-centering / "Focus node" simply no-ops for a non-node doc.
    const rank = stemLower.startsWith(needle) ? 0 : stemLower.includes(needle) ? 1 : 2;
    scored.push({
      rank,
      stem: stemLower,
      result: {
        score: RANK_SCORE[rank],
        source: "vault",
        title: stem,
        doc_type: entry.doc_type,
        node_id: docNodeIdFromStem(stem),
      },
    });
  }
  scored.sort((a, b) => a.rank - b.rank || a.stem.localeCompare(b.stem));
  return scored.slice(0, Math.max(0, cap)).map((s) => s.result);
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
 * Stores controller for the document-search plane. Reads the vault tree (the sole
 * wire access stays in the stores layer) and its structural-tier availability, runs
 * the pure literal match, and returns a bounded, honest view. It does not depend on
 * the semantic tier, so it stays available when rag is offline.
 */
export function useDocumentSearchController(
  query: unknown,
  scope: unknown,
): DocumentSearchView {
  const tree = useVaultTree(scope);
  const availability = useVaultTreeAvailability(scope);
  const q = typeof query === "string" ? query : "";
  const entries = (tree.data as { entries?: VaultTreeEntry[] } | undefined)?.entries;
  const degraded = availability.degraded;
  const isPending = tree.isPending;

  return useMemo(() => {
    const results = matchDocumentEntries(entries, q);
    return {
      results,
      state: deriveDocumentSearchState(q, isPending, degraded),
      count: results.length,
    };
  }, [entries, q, isPending, degraded]);
}
