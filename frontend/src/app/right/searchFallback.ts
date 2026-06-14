// Search fallback + degradation seam (W03.P11.S45; re-skinned W02.P08.S24 onto
// the search surface ADR): when rag is down, search degrades to title/text match
// over the vault corpus (the graph filter's text-match facet, applied to the
// tree) with an EXPLICIT "semantic search offline" state — never a dead control.
//
// The degradation truth is read through the stores `tiers` seam, NOT raw in the
// surface: the engine's `/search` error envelope carries the per-tier block
// (contract §2; every-wire-response-carries-the-tiers-block), and a rag-down
// condition surfaces there as `semantic.available === false`. This module is the
// stores-layer interpreter the panel consumes — the panel reads `semanticOffline`
// (already-interpreted), never the raw block (dashboard-layer-ownership). A
// genuine transport failure that is NOT tier degradation surfaces as `error`,
// kept distinct so "a backend is down" and "your request failed" read
// differently (the tiers contract; search ADR state machine).

import type {
  SearchResult,
  TiersBlock,
  VaultTreeEntry,
} from "../../stores/server/engine";
import { EngineError } from "../../stores/server/engine";
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

// --- degradation seam (pure, unit-tested) -----------------------------------------

/**
 * Whether the `semantic` tier is offline given the search query's outcome. The
 * canonical signal is the tiers block the engine attaches to its error envelope
 * (contract §2): `semantic.available === false`, or the tier being absent from a
 * block the engine served, is "rag is down" — a designed degraded state. A
 * structured rag-down error (an `EngineError` carrying that block) is degradation
 * even when its HTTP status is a 502; a transport fault with NO structured
 * envelope is NOT degradation (it is the genuine error state). This keeps the
 * surface honest: absence-of-tier is degradation, a bare transport failure is an
 * error.
 */
export function isSemanticOffline(
  error: unknown,
  tiers: TiersBlock | undefined,
): boolean {
  const block = tiers ?? (error instanceof EngineError ? error.tiers : undefined);
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

// --- the hook ---------------------------------------------------------------------------

export type SearchPhase = "results" | "degraded" | "error";

export interface SearchWithFallback {
  results: SearchResult[];
  /** True while serving text-match instead of semantic search (G8.a) — read
   *  from the tiers seam, not a bare `isError` (search ADR degradation row). */
  semanticOffline: boolean;
  /** A genuine, non-degradation transport failure the operator can retry. */
  transportError: boolean;
  isPending: boolean;
  /** Re-run the semantic query (the error state's retry affordance). */
  retry: () => void;
}

export function useSearchWithFallback(
  query: string,
  target: "vault" | "code",
  scope: string | null,
): SearchWithFallback {
  const semantic = useEngineSearch(query, target);
  // The degradation truth is the tiers block — on success (`data.tiers`) or on
  // the error envelope the transport preserved (`EngineError.tiers`).
  const semanticOffline = isSemanticOffline(semantic.error, semantic.data?.tiers);
  const transportError = !semanticOffline && isTransportError(semantic.error);
  // The tree backs the text-match fallback; fetch it only when degraded.
  const tree = useVaultTree(semanticOffline ? scope : null);

  const retry = () => void semantic.refetch();

  if (semantic.isError && !semanticOffline) {
    // Genuine transport failure (no tiers envelope): the error state. KEEP the
    // last successful results visible under the banner + retry (search ADR error
    // state: "recoverable, plainly-worded, with retry") — a transient refetch
    // error must not blank a list the operator was reading. TanStack retains
    // `data` across an error, so the stale-but-trustworthy last-good set stands;
    // the result ids are stable across queries (contract §2), so a held result
    // stays selectable.
    return {
      results: semantic.data?.results ?? [],
      semanticOffline: false,
      transportError: true,
      isPending: false,
      retry,
    };
  }
  if (semanticOffline) {
    return {
      results:
        target === "vault" ? buildFallbackResults(tree.data?.entries, query) : [],
      semanticOffline: true,
      transportError: false,
      isPending: tree.isPending && target === "vault",
      retry,
    };
  }
  return {
    results: semantic.data?.results ?? [],
    semanticOffline: false,
    transportError,
    isPending: query.length > 0 && semantic.isPending,
    retry,
  };
}
