---
name: filtering-has-one-canonical-surface
---

# Filtering has one canonical surface; every other surface is a consumer

## Rule

Filtering controls — the text match plus the facet instrument (kinds, doc-types,
feature-tags, statuses, health, and any future facet) — are authored from exactly
ONE canonical surface: the left rail's filter area (`frontend/src/app/left/`,
which mounts the centralized `FilterSidebar`/`FilterMenu` flyout from its search
row). That surface writes the single shared `dashboardState.filters`. Every other
surface — the graph stage (`frontend/src/app/stage/`), the timeline
(`frontend/src/app/timeline/`), and the right activity rail
(`frontend/src/app/right/`) — is a pure CONSUMER that projects the filtered result
and must host no filter control. The timeline's interactive date-range Setter is
the SOLE date-range writer (the facet flyout carries no EDITED/date control), and
the right rail's semantic Search pillar (`POST /search`) is a distinct concept that
is neither absorbed by filtering nor allowed to grow into it.

## Why

Filtering state was already one canonical plane (`dashboardState.filters`, one
`GraphFilter` shape, the stores layer the sole wire client), but the *controls* had
scattered: the advanced facet flyout lived behind the graph toolbar, the rail held
a separate text-only narrower, and date range had two writers. The
`2026-06-19-filter-consolidation-adr` settled placement onto the rail; the
`2026-06-19-filter-consolidation` audit then found the concrete failure mode this
rule fences — a sibling campaign's unified `StageNavBar` retired the graph/timeline
filter but left the facet flyout ORPHANED (mounted by nothing,
`KIND/TOPIC/STATUS/HEALTH` unreachable in the live app). A control that can be
authored from many surfaces drifts (two "where do I filter" entry points) or
vanishes (retired on one surface, never rehomed on another). Pinning one canonical
surface and making the rest consumers is the same single-consumer discipline
`dashboard-layer-ownership` enforces for the wire, applied to filter CONTROLS: one
place authors the filter, many places project it.

## How

- **Good:** a surface needs to react to the filter — it reads the projected,
  already-filtered result through its stores hooks; it adds no filter affordance.
- **Good:** a new facet is needed — it lands as a section in the centralized
  `FilterMenu` surfaced from the rail, writing `dashboardState.filters`; every
  consumer picks it up for free.
- **Good:** the date range is set from the timeline's interactive Setter only; the
  facet flyout may show the active range as a read-back chip but never authors it.
- **Bad:** a "convenience" search box or facet chip on the graph toolbar, the
  timeline header, or the right rail "because the data is right there" — that
  re-scatters the control the single surface exists to centralize. The
  `filterConsolidation.guard.test.ts` structural guard fails the gate when a facet
  filter (`FilterSidebar`/`FilterMenu`/`FacetRow`/`toggleFacet`) is mounted anywhere
  but `app/left/`.
- **Bad:** conflating the right rail's semantic Search pillar with filtering (or
  vice-versa) — they are distinct concepts and must stay fenced.

## Status

Active. Promoted from the `2026-06-19-filter-consolidation` cycle (ADR accepted,
plan executed: the orphaned facet flyout rehomed into the rail, the EDITED date
control dropped, the graph/timeline already filter-free via the sibling
`StageNavBar` campaign, and a structural guard test landed). The centralization
boundary has held across the `filter-controls` and `standardization-hardening`
cycles that preceded it. Sibling rules `dashboard-layer-ownership` (the one-way
boundaries this builds on), `views-are-projections-of-one-model`,
`design-system-is-centralized`, and `figma-is-the-binding-source-of-truth` (the
binding rail filter design this mirrors).

## Source

ADR `2026-06-19-filter-consolidation-adr` (accepted; codification candidate
`filtering-has-one-canonical-surface`) and research
`2026-06-19-filter-consolidation-research` (the rag-verified four-surface map and
the orphaned-flyout finding). Sibling rules `dashboard-layer-ownership`,
`views-are-projections-of-one-model`, `design-system-is-centralized`,
`figma-is-the-binding-source-of-truth`.
