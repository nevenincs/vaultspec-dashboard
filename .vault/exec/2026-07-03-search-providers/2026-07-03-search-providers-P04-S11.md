---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S11'
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
     The S11 and 2026-07-03-search-providers-plan placeholders are machine-filled by
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
     The Adopt the provider host in the search palette and ship the designed compact list: species-eyebrow pills on scene category tokens with mono code titles, the results counter in the header, the Kbd legend footer, and the sunken-plus-accent selected state and ## Scope

- `frontend/src/app/palette/SearchPaletteSurface.tsx + SearchResultPill.tsx + stores/server/searchPill.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Adopt the provider host in the search palette and ship the designed compact list: species-eyebrow pills on scene category tokens with mono code titles, the results counter in the header, the Kbd legend footer, and the sunken-plus-accent selected state

## Scope

- `frontend/src/app/palette/SearchPaletteSurface.tsx + SearchResultPill.tsx + stores/server/searchPill.ts`

## Description

- Swap `SearchPaletteSurface` from `useUnifiedSearchController` to the one
  `useSearchProviders` host, so the palette renders the merged, ranked,
  interleaved three-provider list (semantic + files-vault + files-code).
- Derive the pill views from the host's banded entries (`search.entries.map(e =>
  e.result)`), passing the wrapped wire result each pill needs; the presentation
  view keeps consuming `state` / `semanticOffline` / `error` unchanged.
- Update the surface's layer-law comment to name the host.

## Outcome

The palette is wired to the provider host: one ranked interleaved species-tagged
list from all three sources. The designed compact state was already shipped and
verified correct against the binding Figma — species eyebrows on scene-category
tokens, mono code titles, the results counter, the Kbd legend footer, and the
sunken-plus-accent selected state — so `SearchResultPill.tsx` and `searchPill.ts`
needed no change. Full frontend gate green (0 errors).

## Notes

Scope files `SearchResultPill.tsx` and `searchPill.ts` were already design-correct
from prior palette work (selected state = `border-accent bg-paper-sunken`,
`titleMono` for code, category-token eyebrow colours, feature chip), so this step
touched only `SearchPaletteSurface.tsx`. With this landed, the S09→S11 transitional
gap is closed: a rag outage now shows name matches (files providers) in the palette
again, via the host rather than the retired mode-wide fallback.
