---
generated: true
tags:
  - '#index'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - '[[2026-07-03-search-providers-P01-S01]]'
  - '[[2026-07-03-search-providers-P01-S02]]'
  - '[[2026-07-03-search-providers-P01-S03]]'
  - '[[2026-07-03-search-providers-P01-summary]]'
  - '[[2026-07-03-search-providers-P02-S04]]'
  - '[[2026-07-03-search-providers-P02-S05]]'
  - '[[2026-07-03-search-providers-P02-S06]]'
  - '[[2026-07-03-search-providers-P02-summary]]'
  - '[[2026-07-03-search-providers-P03-S07]]'
  - '[[2026-07-03-search-providers-P03-S08]]'
  - '[[2026-07-03-search-providers-P03-S09]]'
  - '[[2026-07-03-search-providers-P03-S10]]'
  - '[[2026-07-03-search-providers-P03-summary]]'
  - '[[2026-07-03-search-providers-P04-S11]]'
  - '[[2026-07-03-search-providers-P04-S12]]'
  - '[[2026-07-03-search-providers-P04-S13]]'
  - '[[2026-07-03-search-providers-P04-S14]]'
  - '[[2026-07-03-search-providers-P04-summary]]'
  - '[[2026-07-03-search-providers-P05-S15]]'
  - '[[2026-07-03-search-providers-P05-S16]]'
  - '[[2026-07-03-search-providers-P05-S17]]'
  - '[[2026-07-03-search-providers-P05-summary]]'
  - '[[2026-07-03-search-providers-adr]]'
  - '[[2026-07-03-search-providers-audit]]'
  - '[[2026-07-03-search-providers-plan]]'
  - '[[2026-07-03-search-providers-research]]'
---

# `search-providers` feature index

Auto-generated index of all documents tagged with `#search-providers`.

## Documents

### adr

- `2026-07-03-search-providers-adr` - `search-providers` adr: `one search plane, three providers` | (**status:** `accepted`)

### audit

- `2026-07-03-search-providers-audit` - `search-providers` audit: `one search plane review`

### exec

- `2026-07-03-search-providers-P01-S01` - Add the build_code_file_rows projection over all code-prefixed LinkageGraph nodes with the minimal row shape (path, node_id, title, lang), memoized per graph generation beside the vault-tree rows cache, with unit tests over a small ingested fixture
- `2026-07-03-search-providers-P01-S02` - Serve GET /code-files: cursor pagination at 2000 per page, the tiers envelope on success and error, and an honest truncated block when the ingest walk cap bounded the corpus, registered in the contract route table
- `2026-07-03-search-providers-P01-S03` - Cover the new route with wire tests: full cursor walk to completion, page-boundary determinism, truncation honesty, and tier parity on a graphless cell
- `2026-07-03-search-providers-P01-summary` - `search-providers` `P01` summary
- `2026-07-03-search-providers-P02-S04` - Add the codeFiles cursor-walking client (bounded page loop mirroring vaultTree), the tolerant adaptCodeFiles adapter, and the typed CodeFileEntry wire shape
- `2026-07-03-search-providers-P02-S05` - Add the useCodeFiles query hook with bounded cache keyed on scope, walked to completion so client narrowing holds the complete listing
- `2026-07-03-search-providers-P02-S06` - Extract the one shared literal matcher utility with the explicit bands (strong-literal 0.70 to 0.95 for exact or prefix, weak-literal 0.20 to 0.50 for substring), token matching over stem, path, title, and tags, with unit vectors, replacing the two near-duplicate scanners
- `2026-07-03-search-providers-P02-summary` - `search-providers` `P02` summary
- `2026-07-03-search-providers-P03-S07` - Define the SearchProvider contract and the species vocabulary (doc-type words, Code, reserved Change) with the provider entry type carrying species, title, why-line, feature tag, node id, and banded score
- `2026-07-03-search-providers-P03-S08` - Register the three providers: semantic wrapping the existing per-corpus /search pair unchanged, files-vault matching the complete cached vault tree including titles, files-code matching the walked code-files listing, each with its own honest empty and degraded semantics
- `2026-07-03-search-providers-P03-S09` - Build the useSearchProviders host: shared debounce, per-source cache keys, tiers-gated degradation, score-desc merge with best-rank identity dedupe, the 40-item bound, and the shared semantic epoch, folding the rag-down text fallback into the files-vault provider and retiring the mode-wide fallback path
- `2026-07-03-search-providers-P03-S10` - Cover the host with unit vectors (band ordering, dedupe best-rank, provider-absent degradation, epoch merge) and one live-wire settled-search case
- `2026-07-03-search-providers-P03-summary` - `search-providers` `P03` summary
- `2026-07-03-search-providers-P04-S11` - Adopt the provider host in the search palette and ship the designed compact list: species-eyebrow pills on scene category tokens with mono code titles, the results counter in the header, the Kbd legend footer, and the sunken-plus-accent selected state
- `2026-07-03-search-providers-P04-S12` - Reword every rendered search string to plain language: the idle prompt drops by-meaning, the degraded StateBlock becomes Full search is unavailable, showing name matches only, with a matching screen-reader twin, and the palette labels read Search
- `2026-07-03-search-providers-P04-S13` - Make the document finder a thin consumer of the files-vault provider, deleting its private matcher in favor of the shared utility while keeping its keybinding and focused-plane behavior
- `2026-07-03-search-providers-P04-S14` - Delete the vestigial right-rail search pillar: the search panel-tab entry, the focus-search action, keybinding, and command, and the unmounted presentation-view derivations with their tests
- `2026-07-03-search-providers-P04-summary` - `search-providers` `P04` summary
- `2026-07-03-search-providers-P05-S15` - Add the isolated search-pill derivation test file covering species eyebrows, mechanism-free faces, and selected-state derivations
- `2026-07-03-search-providers-P05-S16` - Update the existing suites for the new shapes: the search controller fallback fold, the document controller thin consumer, the palette guard and render tests, and the keymap coverage guards for the deleted action
- `2026-07-03-search-providers-P05-S17` - Verify live end to end: drive the one Search plane against the dev serve with semantic and file hits interleaving, the degraded copy honest with rag stopped conceptually (tiers-simulated), and run the full lint gate
- `2026-07-03-search-providers-P05-summary` - `search-providers` `P05` summary

### plan

- `2026-07-03-search-providers-plan` - `search-providers` plan

### research

- `2026-07-03-search-providers-research` - `search-providers` research: `the Cmd+K search plane as a provider architecture`
