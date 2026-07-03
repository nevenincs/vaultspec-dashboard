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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace search-providers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-07-03-search-providers-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Define the SearchProvider contract and the species vocabulary (doc-type words, Code, reserved Change) with the provider entry type carrying species, title, why-line, feature tag, node id, and banded score and ## Scope

- `frontend/src/stores/server/searchProviders.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
