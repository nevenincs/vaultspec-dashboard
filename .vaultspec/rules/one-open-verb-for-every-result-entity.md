---
name: one-open-verb-for-every-result-entity
---

# One open verb for every result entity; corpus navigation is the search plane

## Rule

Opening or navigating to any result entity — a semantic-search hit, a document-search hit,
a graph node, or a context-menu target — is performed by the one shared open
`ActionDescriptor` (`openEntityAction` in `frontend/src/app/menus/sharedActions.ts`) over
the canonical selection seam (`openMenuNodeIsland` → `openNodeIsland`). No surface
re-implements "open" / "go to", and corpus navigation is served only by the document-search
plane, never by standing per-feature commands.

## Why

The `2026-06-21-command-palette-planes-adr` settled that Cmd+K has three planes — the
command plane, semantic (rag) search, and a new literal document search — and that "open" is
not a per-target command but one verb performed on a result entity, standardized across all
edges (the user directive). Before this, "open" was re-implemented at each call site (the
search surface selected via `selectDashboardNode`, resolvers focused via their own paths),
and the per-feature `go to <feature>` flood approximated document navigation badly. Authoring
the verb once over the existing selection seam removes that drift (the `unified-action-plane`
applied to results) and lets the document-search plane — a rag-free finder over the
structural-tier vault tree — own name lookup so it survives semantic-tier degradation
(`degradation-is-read-from-tiers-not-guessed-from-errors`).

## How

- **Good:** a new result source (a backend search, a history list) → its rows are
  `EntityDescriptor`s and its open action is `openEntityAction({ id, nodeId, scope })`; the
  surface's keyboard open calls the same `openNodeIsland` seam.
- **Good:** the user wants to jump to a document by name → the document-search plane, not a
  standing command.
- **Bad:** a surface adding its own select/open call for a result instead of composing the
  shared verb, or re-introducing per-feature navigation as standing palette commands.

## Status

Active. Promoted at the close of the `command-palette-architecture` campaign's first full
execution cycle. Sibling of `palette-commands-come-from-the-one-provider-registry`,
`unified-action-plane`, `views-are-projections-of-one-model`, and
`degradation-is-read-from-tiers-not-guessed-from-errors`.

## Source

ADR `2026-06-21-command-palette-planes-adr` (codification candidate) and research
`2026-06-21-command-palette-architecture-research` (F4). Reference
`2026-06-21-command-palette-architecture-reference` (the document-search projection
decision, O2).
