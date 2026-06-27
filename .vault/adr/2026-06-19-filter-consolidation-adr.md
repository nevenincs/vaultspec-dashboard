---
tags:
  - '#adr'
  - '#filter-consolidation'
date: '2026-06-19'
modified: '2026-06-19'
related:
  - "[[2026-06-19-filter-consolidation-research]]"
  - "[[2026-06-19-filter-controls-adr]]"
  - "[[2026-06-14-dashboard-left-rail-adr]]"
  - "[[2026-06-15-dashboard-timeline-adr]]"
---

# `filter-consolidation` adr: `one canonical filter surface; every other surface is a consumer` | (**status:** `accepted`)

## Problem Statement

Filtering is scattered across surfaces even though the filter STATE is already
one canonical plane. The graph stage toolbar (`FilterBar`) hosts the live text
search AND the trigger that opens the full facet instrument (`FilterSidebar` —
KIND → TOPIC → STATUS → HEALTH → EDITED); the left rail's in-rail filter
(`RailFilter`) is a separate text-only listing narrower; the right activity rail
carries its own semantic Search pillar; and the timeline owns the date range.
The result is that the same conceptual act — "narrow what I'm looking at" — is
reached from two different places (rail text box, stage toolbar) and the
advanced facet controls live on the graph rather than where a user goes to
choose scope. The product owner's directive: there is exactly ONE canonical
location for filtering controls, and every other surface that filtering affects
— the graph, the timeline, and the right rail — becomes a pure consumer of the
one canonical filter state. This is the opening decision of a centralization
campaign that will then audit every filtering edge, coerce it onto the one
surface, and codify the law. It is a placement-and-ownership decision; it does
not re-decide what the filter contains (the sibling `filter-controls` ADR) nor
re-architect the state plane (already centralized).

## Considerations

- **The state plane is already one canonical authority, so this is purely a
  UX-surface decision.** A single `GraphFilter` shape on `dashboardState.filters`
  carries every facet (kinds, doc-types, feature-tags, glob/regex feature query,
  statuses, plan-tiers, health, date-range, text); all surfaces read/write it
  through stores hooks, and the stores layer is the sole wire client. Nothing
  about the wire, the engine grammar, or the shared filter object changes — only
  WHERE the controls that mutate it are allowed to live.
- **The left rail is the natural canonical home.** The rail is the
  coarse-to-fine scope spine (workspace → worktree → document); "filter what I'm
  pointed at" belongs at the same place the user chooses scope, above the
  listing the filter narrows. The rail already commits canonical filter text
  today, so promoting it from a text-only narrower to the full filter surface is
  an extension of an established seam, not a new mechanism.
- **Filtering is not search, and the distinction must be preserved.** The right
  rail's Search tab is the global SEMANTIC search pillar (`POST /search`, a
  query→ranked-results concept). That is deliberately a different concept from
  facet/text FILTERING (narrowing the in-view corpus by attribute). Consolidating
  filtering must NOT absorb or retire the semantic Search pillar; it must fence
  the two so neither surface grows the other's affordance.
- **The timeline is already conformant.** Its control bar carries only the
  date-range Setter, a lane-visibility switch, and zoom/fit; the prior facet
  chips were already retired. The decision ratifies that state and forbids
  regression, rather than removing anything.
- **This revises one accepted boundary.** The `dashboard-left-rail` ADR
  deliberately separated the in-rail filter (local listing narrower, "issues no
  wire request") from the graph filter, under "two kinds of find must not
  collide". The directive collapses that separation: the rail filter becomes the
  single unified filter driving the shared state. That boundary is consciously
  superseded here (the search-vs-filter line it also drew is kept).

## Constraints

- **Layer ownership is unchanged and absolute.** The canonical filter surface
  writes `dashboardState.filters` only through the existing stores intent hooks;
  it issues no `fetch`, mints no node identity, and reads no raw `tiers` block.
  Consumer surfaces (graph, timeline, right rail) read the projected result
  through their stores hooks. No surface-local filter state is introduced.
- **One state authority per facet; the timeline is the sole date-range writer.**
  Date range is set only by the timeline's interactive Setter; the advanced
  filter drops its EDITED date-range control (a redundant second writer). The
  advanced filter may still render the active range as a read-back / clearable
  chip, but does not author it. Every other facet is authored only from the
  canonical surface.
- **No dead controls; degrade honestly.** STATUS/HEALTH render only when the
  engine serves their vocabulary (inherited from `filter-controls`). A consumer
  surface that has nothing to show under the active filter renders its designed
  empty/degraded state read from `tiers`, never a surface-local "filter"
  affordance to compensate.
- **Search pillar is out of scope and preserved.** The right rail's semantic
  Search (`POST /search`, `searchIntent`/`searchController`) is not filtering and
  is untouched. The ADR fences it explicitly so a future agent does not "unify"
  it into the filter or vice-versa.
- **Parent stability.** The state plane, the centralized kit `FilterMenu` /
  `FilterSidebar`, and the `filter-controls` backend (glob/regex, health) are all
  shipped and mature; this decision depends only on relocating an existing,
  working control. The timeline-top-bar→graph-top-bar merge is a SEPARATE sibling
  ADR and is NOT a dependency of this one.

## Implementation

**The canonical filter surface moves to the left rail.** The rail's
search/filter area hosts the one filter: the kit `SearchField` for live text
match plus the Filter trigger that opens the centralized `FilterMenu` /
`FilterSidebar` facet instrument (KIND → TOPIC → STATUS → HEALTH) on its opaque
flyout. This is the same shared kit menu that exists today; it is re-anchored to
the rail and fed by the same stores facet plane unchanged. The rail filter thus
becomes the unified control that drives BOTH the listing narrowing and the
shared graph/timeline filter state — one authority, as confirmed by the owner.

**The graph stage toolbar retires ALL filtering.** `FilterBar`'s `SearchField`
and its Filter trigger + active-count badge are removed; the graph no longer
hosts any filter affordance. The toolbar retains only non-filter chrome (node
counts, the recoverable filtered-out cost pill as read-back context, create-doc,
layout/zoom controls). The graph renders whatever the canonical filter state
projects.

**The timeline keeps only the interactive Setter.** No content/facet filtering
is permitted on the timeline. Its control bar keeps the date-range Setter (the
sole date-range writer), the lane-visibility switch (a phase-visibility flip,
not a filter), and zoom/fit. This is the current state; the ADR fences it
against regression.

**The right rail hosts no facet filtering.** It consumes the canonical filter
where filtering applies and keeps its distinct semantic Search pillar as the one
allowed query affordance. No facet/text FILTER control is added to the activity
rail.

**The campaign frame.** This ADR is the law; the campaign then (a) audits every
surface for stray filter affordances, (b) coerces them onto the one canonical
surface or removes them, and (c) codifies the single-filter-surface rule so
future surfaces inherit it. The execution plan is authored separately.

## Rationale

The research found the divergence is at the control layer, not the state plane —
so the cheapest correct move is to relocate one already-working control and
forbid the others, not to re-author state or wire access. The left rail is the
right home because filtering is a scope act and the rail is the scope spine; co-
locating "filter" with "choose what I'm pointed at", above the listing it
narrows, matches the user's mental model better than burying the facet
instrument on the graph instrument. Making every other surface a pure consumer
is the same single-consumer discipline the layer rules already enforce for the
wire, applied to filter CONTROLS: one place to author the filter, many places
that project it. Preserving the semantic Search pillar as distinct honors the
`dashboard-left-rail` ADR's still-valid search-vs-filter line while superseding
its now-obsolete in-rail-filter-is-local-only line, because the directive makes
one unified filter the explicit goal.

## Consequences

- **Gains.** Exactly one place to author a filter; the graph, timeline, and
  right rail become predictable projections of one state. The "where do I filter"
  ambiguity (rail text box vs stage toolbar) is gone. New surfaces inherit
  "consume the filter, never host filter controls" for free. The date-range
  single-writer rule removes a redundant authoring path.
- **Costs and difficulties.** It revises an accepted ADR boundary, so the
  `dashboard-left-rail` ADR must be amended (its in-rail-filter section) to point
  here. The rail's vertical budget now also carries the facet flyout trigger; the
  flyout placement over the rail must stay opaque-over-canvas and not crowd the
  browser listing. The graph toolbar loses affordances some muscle-memory expects
  there; the cost pill stays as read-back so "why are nodes hidden" remains
  answerable on the graph.
- **Risks.** The standing temptation is a "convenience" filter box back on the
  graph or a quick facet chip on the right rail "because the data is right there"
  — exactly what the codified law must prevent. Conflating the semantic Search
  pillar with filtering (or vice-versa) is the other risk; the fence must be
  explicit. Date-range drift if a second writer reappears.
- **Pathways opened.** With one canonical filter surface and consumer-only
  siblings, the campaign's follow-on ADR (merge the timeline top bar into the
  graph top bar so timeline + graph read as one element) composes cleanly,
  because neither surface owns filtering by then. Future filter facets are a kit
  addition surfaced in one place.

## Codification candidates

- **Rule slug:** `filtering-has-one-canonical-surface`.
  **Rule:** Filtering controls (text + facet: kinds, doc-types, feature-tags,
  statuses, health, etc.) are authored from exactly one canonical surface — the
  left rail's filter area — writing the one shared `dashboardState.filters`;
  every other surface (graph stage, timeline, right activity rail) is a pure
  consumer that projects the filtered result and must never host a filter
  control. The timeline's interactive date-range Setter is the sole date-range
  writer, and the right rail's semantic Search pillar (`POST /search`) is a
  distinct concept that is neither absorbed by nor allowed to grow into
  filtering. *(Promote after one full execution cycle proves the boundary holds,
  per the codify discipline — this is the campaign's intended durable law.)*
