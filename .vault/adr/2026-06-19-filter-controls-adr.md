---
tags:
  - '#adr'
  - '#filter-controls'
date: '2026-06-19'
modified: '2026-06-22'
related:
  - '[[2026-06-19-filter-controls-research]]'
---

# `filter-controls` adr: `unified filter controls and document-health ingestion` | (**status:** `accepted`)

## Problem Statement

The dashboard's filtering was scattered: the filter UI vocabulary (search bars,
dropdowns, foldouts, flyouts) was hand-built per surface, the toolbar advertised
a "Filter" dropdown while the implementation was a docked panel, and there was no
shared popover/flyout. The user asked for one unified, well-designed filtering
experience spanning the UI and the backend, adding two new dimensions: lifecycle
STATUS (ADR status adjectives plus plan meta-states in-progress/finished) and
document HEALTH (dangling, invalid frontmatter, empty scaffold, orphaned) — the
invalidation conditions vaultspec-core owns. The backend had to be brought up to
par with the frontend, Figma-first with per-element visual-parity verification.

## Considerations

The state plane and engine were already mature: one `GraphFilter` shape, one
canonical dashboard-state patch, a generation-cached `/filters` vocabulary, and
the stores layer as the sole wire client. The genuine gaps were the per-surface
UI controls, two unserved-to-the-client facets (statuses/plan-tiers were served
by the engine but dropped by the client adapter), and the absent glob/regex and
health dimensions. Figma is the binding source of truth; the binding Filter menu
node already existed (KIND/TOPIC/EDITED) and could be extended in place.

## Constraints

The engine is read-and-infer: it must derive health from sources it owns, never
write the vault. The two health conditions the engine can derive from its own
`LinkageGraph` are dangling (a broken outgoing structural edge) and orphaned (no
incoming edge); the schema-dependent conditions (invalid frontmatter, empty
scaffold) require a vaultspec-core `vault check` ingestion and are deferred.
Health filtering is graph-context, so it cannot ride the per-node `matches_node`
predicate and is applied in the query after the node pass. No dead controls:
STATUS/HEALTH render only when the engine serves their vocabulary.

## Implementation

A single presentational Filter menu composes the centralized kit — a new
`FacetRow` (checkbox/radio + optional status/health dot + count) and a new
`FilterMenu` (KIND → TOPIC → STATUS → HEALTH → EDITED) — fed by a thin
stores-container that wires the existing dashboard-state facet plane unchanged.
It is delivered as an anchored flyout from the toolbar trigger, on an OPAQUE
popover surface (a translucent panel composites see-through over the
portal-pinned WebGL canvas and reads as broken), with a viewport-relative
max-height so a large corpus vocabulary scrolls rather than overflows. Dismiss is
the shared kit `Popover` (Escape + outside-pointer, with an `ignoreSelector` so
an external trigger owns its own toggle). The engine gains glob/regex feature
search (validated, compile-once, size-bounded) and engine-derived health
(dangling/orphaned) enumerated in the vocabulary and applied in the query; the
client adapter is corrected to carry statuses/plan-tiers/health end to end.

## Rationale

The research found the divergence was at the control layer, not the architecture
— so the decision is to converge controls onto the centralized kit rather than
re-author state or wire access, honoring the existing layer boundaries. STATUS
and HEALTH as two distinct facet kinds match the user's mental model (lifecycle
vs validity). Deriving the first two health conditions from the engine's own
graph delivers a real, correct capability immediately within the read-and-infer
boundary, leaving the core-dependent conditions as a clean follow-up.

## Consequences

A control on the filter menu now always resolves to a real shared kit
definition; STATUS/HEALTH are live against the real corpus (health filtering
live-verified narrowing the corpus and rejecting out-of-set conditions). The
opaque-flyout decision fixes the see-through-over-canvas failure. Costs: the
health filter recomputes per query over the matched set (memoization per graph
generation is a follow-up); invalid/empty-scaffold await the core ingestion; the
glob/regex UI mode-toggle is built on the backend but not yet surfaced.

## Codification candidates

- **Rule slug:** `overlay-surfaces-are-opaque-over-the-canvas`.
  **Rule:** Any chrome overlay that can render above the portal-pinned WebGL
  graph canvas (popovers, flyouts, menus) must use an opaque surface fill, never
  a translucent/`backdrop-blur` panel, which composites see-through over the
  canvas and reads as broken.
- **Rule slug:** `graph-context-filters-apply-outside-matches-node`.
  **Rule:** A filter dimension that needs graph context (a node's incident edges,
  e.g. dangling/orphaned health) is applied in the query after the per-node
  `matches_node` pass, never inside it, and is memoized on the graph generation.
