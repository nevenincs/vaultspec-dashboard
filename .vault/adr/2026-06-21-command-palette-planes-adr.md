---
tags:
  - '#adr'
  - '#command-palette-planes'
date: '2026-06-21'
modified: '2026-06-22'
related:
  - "[[2026-06-21-command-palette-architecture-research]]"
---

# `command-palette-planes` adr: `three Cmd+K planes and the standardized open verb` | (**status:** `accepted`)

## Problem Statement

Cmd+K conflates concerns. Today the palette has two modes — `command`
(`frontend/src/stores/view/commandPalette.ts`) and `search` (the rag-backed unified
controller `frontend/src/stores/server/searchController.ts` rendered by
`frontend/src/app/palette/SearchPaletteSurface.tsx`) — and the command mode itself is
polluted with one `go to <feature>` per feature tag (research F2). That per-feature
navigation is a broken approximation of "find a document and open it": it floods the verb
plane, it is bounded to 128 arbitrary feature tags, and it does not actually let a user
find a *document* by name. Meanwhile "open" is re-implemented at each call site rather than
being one verb.

This is the second ADR of the `command-palette-architecture` cluster. It decides the
*plane model* and the *open verb*. It depends on the `command-palette-providers` ADR (the
command plane is provider-fed) and is depended on by `command-palette-actions` (the open
verb is one entry in the taxonomy). The user directive that motivates it: corpus navigation
*is* the search; rag search remains; a document search is introduced; and "go to / open" is
a single action performed on a result, standardized across all edges.

## Considerations

- **Three distinct planes, not two.** (1) The **command plane** — real app verbs from the
  provider registry, no corpus. (2) **Semantic search** — the existing rag-ranked unified
  vault+code search; meaning-first, kept as is. (3) **Document search** — a new literal
  name/title finder over the corpus the engine already serves (the vault tree / node
  inventory), for the "I know roughly what it's called, take me there" case the per-feature
  flood was approximating. Semantic and document search are different tools: rag answers
  "what is about X", document search answers "where is the thing named X". Folding them
  would lose the literal-precision case and re-grow the rag dependency for trivial name
  lookups.
- **One open verb on a result entity (the user's "standardized across all edges").** A
  search result is an `EntityDescriptor` (the kind already used by the resolver registry —
  `node`, `vault-doc`, `code-file`, etc.). "Open / go to" is one shared `ActionDescriptor`
  built once, over the canonical selection seam `openNodeIsland` / `selectNode`
  (`frontend/src/stores/view/selection.ts`) — the same click-through the graph node, the
  context-menu resolver, and the search result already (separately) use. The decision makes
  it literally the same verb: opening a document-search hit, a semantic-search hit, a graph
  node, and a context-menu "open" all run one builder. This is the `unified-action-plane`
  applied to results.
- **Mode model.** The three planes are modes of the one overlay, not three popups (the
  existing "Command-K controls searching" property holds). A mode prefix / toggle selects
  the plane; the default and the inter-mode transitions are a UX detail bounded by the
  binding Figma `SearchPalette` frames. The command plane stays the default Cmd+K surface;
  Mod+P (already the search keybinding) opens search.
- **Document-search backend (open question O2 from research).** Two options: reuse the rag
  sparse/literal half, or index names over the vault-tree/node inventory the engine already
  serves. The leaning is the latter for the literal case (no rag dependency, works when
  semantic is degraded), reusing the bounded node/tree projection already on the wire — but
  this is the one genuinely open sub-decision and is called out for the plan to resolve with
  a spike.

## Constraints

- **Parent stability.** The unified search controller, the `commandPalette` mode store, and
  the selection seam are all shipped and stable. Document search is the only genuinely new
  data path; it must reuse an existing bounded engine projection
  (`graph-queries-are-bounded-by-default`) and add no unbounded wire.
- **Layer ownership.** Search and open read through the stores layer; the palette never
  fetches the engine and never reads raw `tiers`; degraded search state is read from the
  `tiers` block, never guessed from a transport error
  (`degradation-is-read-from-tiers-not-guessed-from-errors`).
- **Standardized open must not fork.** The open verb is authored once (shared builder) and
  composed by every edge; a per-surface re-implementation of open is the anti-pattern this
  ADR exists to prevent.
- **User-facing labels.** Plane names and the open verb read in plain language
  (`ui-labels-are-user-facing`) — "Search documents and code", "Open", not internal seam
  names.

## Implementation

The palette overlay carries three modes. The **command** mode renders the provider-fed
verb list (providers ADR). The **semantic search** mode is the existing unified rag
controller and pill list, unchanged in substance. The new **document search** mode renders a
literal name/title finder over a bounded engine projection of the corpus (the vault-tree /
node inventory), filtered client-side or by a bounded query, producing result entities.

Every result — in either search mode — is an `EntityDescriptor`. A single shared
`openEntityAction` builder produces the one `ActionDescriptor` that opens it through the
canonical selection seam (`openNodeIsland` / `selectNode`), re-centering the scene and
opening the island/document exactly as the graph click-through does. The same builder is
composed by: the document-search result, the semantic-search result (replacing the bespoke
`selectDashboardNode` call in `SearchPaletteSurface`), the context-menu resolvers' "open"
entry, and any future edge. Activating a result *is* firing that verb.

The mode model is a small extension of the existing two-mode store: a third mode value plus
the transition rules (which plane Cmd+K vs Mod+P open, how typing a prefix or toggling
switches plane). Degradation is honest per plane: when the semantic tier is down (read from
`tiers`), semantic search shows the designed offline state and document search remains fully
available (it does not depend on rag), so the user can always find a document by name.

The concrete mode-state shape, the `openEntityAction` signature, the document-search wire
projection choice, and the entity-mapping per result kind are reference-document detail.

## Rationale

The user's framing resolves the design cleanly: corpus navigation belongs in search, not in
the verb list, so the command plane is freed of pollution (providers ADR) while the genuinely
useful "find and open" affordance is *strengthened* into a real document finder instead of a
128-entry feature flood. Splitting semantic from document search keeps each tool honest —
rag for meaning, a literal index for names — and keeps name lookup working when rag is
degraded (`degradation-is-read-from-tiers`). Making open one shared verb over the existing
selection seam is the `unified-action-plane` discipline: the seam already exists
(`openNodeIsland`), so standardizing every edge onto it removes drift rather than adding
mechanism, and it satisfies the directive that open be "standardized across all edges."

## Consequences

- **Gains.** A clean three-plane Cmd+K (verbs / meaning / names); the command plane freed of
  corpus pollution; a real document finder replacing the feature flood; one open verb every
  edge composes; name lookup survives rag degradation.
- **Costs / difficulties.** Document search is new data plumbing — the backend projection
  choice (O2) needs a spike, and the mode model gains a third state with its own transitions
  and Figma-bound UX. Re-pointing the semantic-search result's open path onto the shared verb
  must preserve the existing expand/split reader behavior.
- **Pitfalls.** Letting document search quietly become a second rag dependency (instead of a
  literal index) would defeat the degradation-resilience rationale. Re-implementing open at a
  new edge instead of composing the shared builder re-forks the verb. Conflating the two
  search planes in the UI would lose the literal-precision case.
- **Pathways opened.** Result entities + one open verb generalize to any future result
  source (a backend search, a history list); the three-plane model gives a home for future
  planes (e.g. a "run" / action-on-selection plane) without another popup.

## Codification candidates

- **Rule slug:** `one-open-verb-for-every-result-entity`.
  **Rule:** Opening or navigating to any result entity (search hit, graph node,
  context-menu target) is performed by the one shared open `ActionDescriptor` over the
  canonical selection seam; no surface re-implements "open / go to", and corpus navigation is
  served only by the document-search plane, never by standing per-feature commands.

  *(Promote only after it holds across one full execution cycle.)*
