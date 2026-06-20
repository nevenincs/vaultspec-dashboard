---
tags:
  - '#audit'
  - '#dashboard-state-centralization'
date: '2026-06-17'
modified: '2026-06-17'
related:
  - "[[2026-06-17-dashboard-state-centralization-plan]]"
---
# `dashboard-state-centralization` audit: state authority pass

## Scope

Reviewed the dashboard-state centralization pass after moving filter, timeline,
node selection, hover, graph bounds, and panel-tab subscribers toward the
backend-backed TanStack state surface.

## Findings

## graph-default-001 | high | resolved bounded graph default

The canonical dashboard-state default used `document` granularity, which made a
fresh scope eligible for an unfiltered document graph query. The backend default
and tolerant frontend adapter now default to `feature`; explicit feature descent
still switches to `document` only with a bounded `feature_tags` filter.

## right-selection-002 | high | resolved right-rail node writers

Right-rail rows still wrote node selection through the legacy view store after
the stage began reading canonical `selected_ids`. Node rows now write through a
dashboard-state selection helper. Commit event rows write touched node ids into
dashboard state while retaining local event metadata for event-specific display.

## panel-state-003 | high | resolved shell panel authority

Canonical `panel_state` existed but shell collapse and right-tab state still
lived in local shell/view state. The shell now reads `panel_state` when loaded
and writes collapse and right-tab changes back through dashboard-state mutations,
with local fallback only before canonical state is available.

## filter-race-004 | medium | resolved debounced filter overwrite

The text filter debounce captured a stale full `filters` object and could
overwrite newer facet or tier changes. The debounced writer now reads the latest
dashboard filter snapshot at fire time before applying the text patch.

## settings-writer-005 | medium | resolved legacy settings writes

The settings bridge seeded graph granularity, confidence floors, and text filter
values into the old stores. Those writes are removed; the settings effect now
only applies the document-level reduce-motion attribute. Graph and filter
defaults must be handled by dashboard state, not the legacy stores.

## dashboard-patch-006 | high | resolved atomic partial patches

The final review found that dashboard-state PATCH read the current snapshot,
released the slot lock, applied a partial patch, then reinserted the result.
Two concurrent partial writers could therefore start from the same stale base
and lose the earlier field. The route now reads, applies, and reinserts while
holding the dashboard-state slot lock, and the route tests cover disjoint
filter and date-range patches merging into one canonical snapshot.

## feature-selection-007 | high | resolved synthesized feature selection

The final review found that the scene bridge forwarded default
feature-granularity selections such as `feature:state`, while backend
selection validation only accepted stored graph node ids. Canonical selection
therefore rejected the feature nodes the graph route itself serves. Validation
now accepts `feature:{tag}` only when at least one current graph node carries
that feature tag, and coverage exercises both the backend route and the
production scene-selection bridge with a real feature node.

## Recommendations

The remaining local selection metadata is intentionally scoped to event and edge
details that the backend dashboard-state schema does not yet carry. Panel
dimensions and visibility remain local-only chrome; shared panel collapse and
right-tab state are canonical. No open high or medium state-authority findings
remain after the final review fixes.

## Codification candidates

No new codification candidate. The existing `views-are-projections-of-one-model`
and `graph-queries-are-bounded-by-default` rules already cover the corrected
failures.
