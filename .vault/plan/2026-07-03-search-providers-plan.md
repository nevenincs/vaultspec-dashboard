---
tags:
  - '#plan'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
tier: L2
related:
  - '[[2026-07-03-search-providers-adr]]'
  - '[[2026-07-03-search-providers-research]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

# `search-providers` plan

### Phase `P01` - Engine code-files projection

The one contract event: a complete cursor-paginated code-file listing projected off the LinkageGraph with truncation honesty (ADR D1 files-code source, Constraints).

- [x] `P01.S01` - Add the build_code_file_rows projection over all code-prefixed LinkageGraph nodes with the minimal row shape (path, node_id, title, lang), memoized per graph generation beside the vault-tree rows cache, with unit tests over a small ingested fixture; `engine/crates/engine-query/src/graph.rs + vaultspec-api/src/app.rs`.
- [ ] `P01.S02` - Serve GET /code-files: cursor pagination at 2000 per page, the tiers envelope on success and error, and an honest truncated block when the ingest walk cap bounded the corpus, registered in the contract route table; `engine/crates/vaultspec-api/src/routes/ + lib.rs`.
- [ ] `P01.S03` - Cover the new route with wire tests: full cursor walk to completion, page-boundary determinism, truncation honesty, and tier parity on a graphless cell; `engine/crates/vaultspec-api/tests/`.

### Phase `P02` - Frontend readers and the shared literal matcher

The cursor-walking code-files reader, its tolerant adapter, and the one literal matcher utility with the explicit rank bands (ADR D1, D2).

- [ ] `P02.S04` - Add the codeFiles cursor-walking client (bounded page loop mirroring vaultTree), the tolerant adaptCodeFiles adapter, and the typed CodeFileEntry wire shape; `frontend/src/stores/server/engine.ts + liveAdapters.ts`.
- [ ] `P02.S05` - Add the useCodeFiles query hook with bounded cache keyed on scope, walked to completion so client narrowing holds the complete listing; `frontend/src/stores/server/queries.ts`.
- [ ] `P02.S06` - Extract the one shared literal matcher utility with the explicit bands (strong-literal 0.70 to 0.95 for exact or prefix, weak-literal 0.20 to 0.50 for substring), token matching over stem, path, title, and tags, with unit vectors, replacing the two near-duplicate scanners; `frontend/src/stores/server/literalMatch.ts`.

### Phase `P03` - The provider seam

The SearchProvider contract, the three registered providers, and the useSearchProviders host lifting the proven unified-controller machinery, with the rag-down fallback folded into files-vault (ADR D1, D2, D5).

- [ ] `P03.S07` - Define the SearchProvider contract and the species vocabulary (doc-type words, Code, reserved Change) with the provider entry type carrying species, title, why-line, feature tag, node id, and banded score; `frontend/src/stores/server/searchProviders.ts`.
- [ ] `P03.S08` - Register the three providers: semantic wrapping the existing per-corpus /search pair unchanged, files-vault matching the complete cached vault tree including titles, files-code matching the walked code-files listing, each with its own honest empty and degraded semantics; `frontend/src/stores/server/searchProviders.ts`.
- [ ] `P03.S09` - Build the useSearchProviders host: shared debounce, per-source cache keys, tiers-gated degradation, score-desc merge with best-rank identity dedupe, the 40-item bound, and the shared semantic epoch, folding the rag-down text fallback into the files-vault provider and retiring the mode-wide fallback path; `frontend/src/stores/server/searchProviders.ts + searchController.ts`.
- [ ] `P03.S10` - Cover the host with unit vectors (band ordering, dedupe best-rank, provider-absent degradation, epoch merge) and one live-wire settled-search case; `frontend/src/stores/server/searchProviders.test.ts`.

### Phase `P04` - Surface adoption, plain words, dead pillar deletion

The palette consumes the provider host and ships the designed compact list state, every rendered string goes plain-language, the document finder becomes a thin provider consumer, and the vestigial right-rail search pillar is deleted (ADR D3, D4).

- [ ] `P04.S11` - Adopt the provider host in the search palette and ship the designed compact list: species-eyebrow pills on scene category tokens with mono code titles, the results counter in the header, the Kbd legend footer, and the sunken-plus-accent selected state; `frontend/src/app/palette/SearchPaletteSurface.tsx + SearchResultPill.tsx + stores/server/searchPill.ts`.
- [ ] `P04.S12` - Reword every rendered search string to plain language: the idle prompt drops by-meaning, the degraded StateBlock becomes Full search is unavailable, showing name matches only, with a matching screen-reader twin, and the palette labels read Search; `frontend/src/stores/view/commandPalette.ts`.
- [ ] `P04.S13` - Make the document finder a thin consumer of the files-vault provider, deleting its private matcher in favor of the shared utility while keeping its keybinding and focused-plane behavior; `frontend/src/stores/server/documentSearchController.ts + app/palette/DocumentSearchSurface.tsx`.
- [ ] `P04.S14` - Delete the vestigial right-rail search pillar: the search panel-tab entry, the focus-search action, keybinding, and command, and the unmounted presentation-view derivations with their tests; `frontend/src/stores/server/engine.ts + searchController.ts + stores/view/rightRailKeybindings.ts + rightRailCommandProvider.ts`.

### Phase `P05` - Test closure and live verification

Isolated pill tests, updated suites for the new degraded shape and deletions, and a live end-to-end check of the one Search plane (ADR D4, Verification).

- [ ] `P05.S15` - Add the isolated search-pill derivation test file covering species eyebrows, mechanism-free faces, and selected-state derivations; `frontend/src/stores/server/searchPill.test.ts`.
- [ ] `P05.S16` - Update the existing suites for the new shapes: the search controller fallback fold, the document controller thin consumer, the palette guard and render tests, and the keymap coverage guards for the deleted action; `frontend/src/stores/server/*.test.ts + app/palette tests`.
- [ ] `P05.S17` - Verify live end to end: drive the one Search plane against the dev serve with semantic and file hits interleaving, the degraded copy honest with rag stopped conceptually (tiers-simulated), and run the full lint gate; `live verification + just dev lint all`.

## Description

Expand the Cmd+K search plane into the provider architecture the ADR decided: one
user-facing "Search" composing three sources - semantic (the hardened rag /search
pair, wire unchanged), files (vault) over the complete cached vault tree, and files
(code) over a new complete cursor-paginated engine listing - merged into one ranked
interleaved species-tagged list per the binding design's compact state, with explicit
rank bands so literal name matches never masquerade as (nor drown under) meaning
matches. The rag-down text fallback folds into the files-vault provider so a semantic
outage degrades to name matching instead of a dead mode. Every rendered string goes
plain-language, the document finder becomes a thin consumer of the shared matcher,
and the dead right-rail search pillar is deleted. The expanded list-plus-reader split
is the recorded follow-on, not part of this plan.

## Parallelization

Phase P01 (engine) and Phase P02's S06 (the matcher utility) are independent and may
run in parallel. S04 and S05 depend on P01's served shape. P03 depends on P02
entirely. P04 depends on P03, though S12 (terminology) and S14 (pillar deletion) are
independent of the provider seam and may run alongside P03. P05 runs last. Within
phases, steps are sequential except where noted.

## Verification

- Engine: `cargo test -p engine-query -p vaultspec-api` green including the new
  projection unit tests and /code-files wire tests (cursor walk, truncation honesty,
  tier parity).
- Frontend: all search suites green via the live-wire harness (provider host
  vectors, band ordering, dedupe, degradation-as-provider-absent, pill derivations,
  updated palette guard and render tests); no engine mocks anywhere.
- Full lint gate exit 0 before any green claim: `just dev lint all`.
- Grep-verifiable deletions: no `matchDocumentEntries` duplicate scanner, no
  `buildFallbackResults` mode-wide fallback path, no "search" entry in
  `DASHBOARD_PANEL_TABS`, no `focusRightRailSearch` command or keybinding, no
  rendered string containing "rag", "semantic", "vector", or "by meaning" on the
  search planes (ops console exempt).
- Live behavior: Mod+P against the dev serve interleaves meaning matches and file
  hits in one ranked list with species eyebrows and the results counter; a code
  filename query surfaces the file with a navigable node id; the degraded state
  renders the plain-language copy while files providers keep serving.
- The plan is complete when every Step row is closed and the mandatory
  vaultspec-code-review audit records its verdict.
