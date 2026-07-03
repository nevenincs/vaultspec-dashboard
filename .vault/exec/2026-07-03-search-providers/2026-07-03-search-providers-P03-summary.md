---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

# `search-providers` `P03` summary

## Description

Phase P03 established the `SearchProvider` seam, registered three providers, and built the `useSearchProviders` host that lifts the unified-controller machinery into one ranked interleaved list. The contract defines a hook-shaped source `(query, scope) → { id, entries, state }` and the `SearchProviderState` enum for phase tracking. The species vocabulary — doc (renders its doc-type word), code (renders "Code"), reserved commit (renders "Change") — re-exports the existing `SearchResultSpecies` so it cannot fork. The `SearchBand` provenance (`semantic` / `strong-literal` / `weak-literal`) derives from the `literalBand()` helper. Three providers register: semantic (wrapping the existing per-corpus `/search` pair unchanged), files-vault (matching the complete cached vault tree via the shared literal matcher), and files-code (matching the walked code-files listing). The host merges results score-descending, dedupes by best-rank node-id identity, applies the 40-item bound after merge, gates degradation on the `tiers` block (a semantic outage is a non-event; files providers keep serving), and folds the rag-down text fallback into files-vault so a semantic outage degrades to name matching instead of a dead mode. Unit vectors cover band ordering, dedupe, provider-absent degradation, and epoch merge. One live-wire settled-search case exercises the host.

### Files Modified / Created

- Created: `frontend/src/stores/server/searchProviders.ts` (contract, vocabulary, three providers, host)
- Modified: `frontend/src/stores/server/searchController.ts` (host adoption)
