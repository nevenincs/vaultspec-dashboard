// Search fallback (W03.P11.S45, ADR G8.a): when rag is down, search
// degrades to title/text match over the vault corpus (the graph filter's
// text-match facet, applied to the tree) with an EXPLICIT
// "semantic search offline" state — never a dead control. The degradation
// matrix row, operationalized.

import type { SearchResult, VaultTreeEntry } from "../../stores/server/engine";
import { useEngineSearch, useVaultTree } from "../../stores/server/queries";
import { pathStem, pathToNodeId } from "../left/browserSelection";

// --- pure fallback matching (unit-tested) -------------------------------------------

/** Title/text match over the vault tree; earlier matches score higher. */
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
      // Earlier, tighter matches score higher; the band stays below 1 so
      // a fallback score never masquerades as a semantic certainty.
      score: Math.max(0.1, 0.9 - index / Math.max(1, haystack.length)),
      source: stem,
      excerpt: `${entry.doc_type} · #${entry.feature_tags.join(" #")}`,
      node_id: pathToNodeId(entry.path),
    });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 20);
}

// --- the hook ---------------------------------------------------------------------------

export interface SearchWithFallback {
  results: SearchResult[];
  /** True while serving text-match instead of semantic search (G8.a). */
  semanticOffline: boolean;
  isPending: boolean;
}

export function useSearchWithFallback(
  query: string,
  target: "vault" | "code",
  scope: string | null,
): SearchWithFallback {
  const semantic = useEngineSearch(query, target);
  // The tree is cached rail-side already; the fallback reuses it.
  const tree = useVaultTree(semantic.isError ? scope : null);

  if (!semantic.isError) {
    return {
      results: semantic.data?.results ?? [],
      semanticOffline: false,
      isPending: query.length > 0 && semantic.isPending,
    };
  }
  return {
    results: target === "vault" ? buildFallbackResults(tree.data?.entries, query) : [],
    semanticOffline: true,
    isPending: tree.isPending,
  };
}
