---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S07'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

# Define the SearchProvider contract and the species vocabulary (doc-type words, Code, reserved Change) with the provider entry type carrying species, title, why-line, feature tag, node id, and banded score

## Scope

- `frontend/src/stores/server/searchProviders.ts`

## Description

- Create `searchProviders.ts` with the `SearchProvider` contract: a hook-shaped
  source `(query, scope) → { id, entries, state }` and the `SearchProviderState`
  phase enum, so the three sources register behind one seam (host lands in S09).
- Define the species vocabulary by re-exporting the one `SearchResultSpecies`
  (doc / code / commit / unknown) the pill already renders — doc shows its
  doc-type word, code shows "Code", the reserved commit shows "Change" — so the
  vocabulary cannot fork and the future Change provider is a registration.
- Define the `SearchBand` provenance (`semantic` / `strong-literal` /
  `weak-literal`) and `literalBand(score)` deriving the two literal tiers from
  the landed `STRONG_LITERAL_BAND` floor.
- Define `SearchProviderEntry` (the wire `result` carrying title / why-line
  (excerpt) / feature tag / node id / banded score, plus derived species and
  band) and `toProviderEntry(result, band)`.

## Outcome

The provider seam contract is in place, consuming the landed `literalMatch.ts`
bands and the existing species helper — no parallel vocabulary or result shape
minted. Full frontend gate green (`just dev lint frontend`: eslint 0 errors, tsc,
prettier, lint:px, tokens, figma:names all clean; the 2 eslint warnings are
pre-existing in `perFileTimingReporter.ts`, untouched here).

## Notes

The entry keeps the existing `SearchResult` as its `result` rather than minting a
flat normalized shape: the wire result already carries every field the ADR's
entry vocabulary names (title, excerpt→why, feature→tag, node_id, score), and the
pill derivation consumes `SearchResult` directly — a parallel shape would fork
from the pill and the merge machinery. Species and band are added as explicit
derived provenance so the S09 host reasons about a hit without re-deriving it.
