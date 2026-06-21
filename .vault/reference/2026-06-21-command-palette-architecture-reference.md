---
tags:
  - '#reference'
  - '#command-palette-architecture'
date: '2026-06-21'
modified: '2026-06-21'
related:
  - "[[2026-06-21-command-palette-planes-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #reference) and one feature tag.
     Replace command-palette-architecture with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `command-palette-architecture` reference: `command palette implementation reference`

Code-level reference for the command-palette campaign: the contribution registry
surface, the standardized open verb, and the document-search plane's backend
projection decision. Captures the implementation contracts the waves build on.

## Summary

### Contribution registry (W01)

The command plane is fed by a stores-layer registry (`commandRegistry.ts`):
`registerCommandProvider(id, provider)` (capped, disposer) and a generic
`resolveCommands(ctx)` host that applies the time-travel gate, de-dupes by id, and
bounds the list. `CommandDescriptor` = the shared `ActionDescriptorBase` + a `family`
+ a store-only `run`. `CommandContext` carries the read snapshot (scope, time-travel,
graph-frozen, shell-frame booleans, the live keybinding override map) and a
`CommandIntents` bundle of injected effect callbacks so providers stay pure. Providers
live under `stores/view/commandProviders/` and self-register; `app/menus/registerAllCommands.ts`
imports them once at the shell. The assembly hook `useCommandPaletteCommandView`
builds the context from raw stable selectors and calls the host.

### Standardized open verb (W02.P04)

`openEntityAction({ id, nodeId, scope, label?, disabledReason? })` in
`app/menus/sharedActions.ts` is the ONE open verb: its `run` calls the canonical
selection seam `openMenuNodeIsland` → `openNodeIsland` (select + open island +
recenter). It is composed by the search-result resolver (`searchResultMenu`) and the
search palette surface's `openSelected` (re-pointed off the old `selectDashboardNode`
onto `openNodeIsland`). Disabled-with-reason when the entity has no graph node.

### Document-search backend projection (W02.P05 — ADR open question O2, RESOLVED)

**Decision: the literal document finder reuses the existing vault-tree projection
(`useVaultTree`, the structural tier) and filters client-side — NO new engine
endpoint.** Rationale: (1) the vault tree is already a bounded, engine-served corpus
listing every document by path; (2) it lives on the STRUCTURAL tier, independent of
the SEMANTIC (rag) tier, so the literal finder stays fully available when rag is
offline — the degradation-resilience the planes ADR wanted; (3) reusing it honors
`engine-read-and-infer` (backend feeds verbs/data through existing wires only) and
`graph-queries-are-bounded-by-default`. The pure matcher `matchDocumentEntries`
(`documentSearchController.ts`) tokenizes the query and requires every token in the
entry's stem/path/doc-type, ranks stem-prefix > stem-substring > path-substring, and
caps at `DOCUMENT_SEARCH_RESULTS_MAX` (40). Each hit is emitted as a
`SearchResultEntity` carrying `nodeId = docNodeIdFromStem(stem)`, so the existing
`SearchResultPill` and the standardized open verb work for a document hit with no new
rendering or open path. The rejected alternative (a rag sparse/literal half) would
have re-coupled name lookup to the semantic tier.

### Three planes (W02.P06)

The palette overlay carries three modes on the one `commandPalette` store:
`command` (provider-fed verbs), `search` (the existing unified rag controller), and
`document` (the literal finder above). `Mod+K` opens command, `Mod+P` opens search;
the document plane is reachable by mode switch within the overlay. Degradation is
per-plane: semantic offline shows the designed offline state while the document plane
remains available.
