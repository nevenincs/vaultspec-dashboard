---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S09'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

# Build the useSearchProviders host: shared debounce, per-source cache keys, tiers-gated degradation, score-desc merge with best-rank identity dedupe, the 40-item bound, and the shared semantic epoch, folding the rag-down text fallback into the files-vault provider and retiring the mode-wide fallback path

## Scope

- `frontend/src/stores/server/searchProviders.ts + searchController.ts`

## Description

- Build `useSearchProviders(query, scope)`: compose the three registered
  providers, merge their entries score-desc, dedupe by node identity keeping the
  best rank (first == highest), bound to 40, and collapse the provider states
  into one palette phase — all lifting `mergeUnifiedSearch` / `unifiedResultIdentity`
  / `mergeSemanticEpoch` from the unified controller verbatim.
- Extend `SearchProviderResult` with optional `semanticEpoch` + `retry` (set only
  by the semantic provider) so the host forwards the one shared epoch and fans a
  retry across all sources; expose the `SearchProvidersView`.
- Retire the mode-wide text fallback in `searchController.ts` (ADR D2 fold):
  delete `buildFallbackResults` + `SEARCH_FALLBACK_RESULTS_MAX_ITEMS`, drop the
  fallback `useVaultTree` fetch and the `fallbackEntries`/`fallbackPending`
  params, and make the semantic-offline branch contribute an EMPTY result set —
  keeping the exported tiers-gated `semanticOffline` truth the host gates on.
- Update `searchController.test.ts` minimally to compile + pass: remove the
  `buildFallbackResults` suite and the fallback params/assertions in the
  interpret vectors, asserting the new empty-offline, target-independent
  behavior.

## Outcome

The one Search host is in place: three providers merged into a single ranked,
deduped, bounded, species-tagged list with a non-event degraded state (rag down →
files providers carry names). Full frontend gate green; the searchController (46),
ragControl + commandPalette (47), and prior suites pass live. `noCodeFallback` is
transitionally retained on the view type (always false) because the right-rail
presentation still reads it — that presentation and the field go together in S14.

## Notes

Scope reached into `searchController.test.ts` (nominally S16's remit) only as far
as needed to keep the suite compiling after the fallback deletion — removing the
`buildFallbackResults` suite and the fallback params from the interpret vectors.
The broader S16 test rework (document-controller thin consumer, palette guard,
keymap coverage for the deleted action) is untouched here. Transitional: until
S11 wires the palette to `useSearchProviders`, `SearchPaletteSurface` still calls
`useUnifiedSearchController`, which is now purely semantic — so between S09 and
S11 a rag outage shows no name matches in the palette; the host restores them at
S11. Not user-facing (feature branch).
