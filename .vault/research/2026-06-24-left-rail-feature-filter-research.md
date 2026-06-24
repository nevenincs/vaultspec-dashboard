---
tags:
  - '#research'
  - '#left-rail-feature-filter'
date: '2026-06-24'
modified: '2026-06-24'
related: []
---

# `left-rail-feature-filter` research: `Feature-filter wire, autofill matching, and flyout anchoring`

Live, source-and-runtime discovery done before and during the build of the rail
feature search bar, its autofill, and the advanced-filter flyout. It grounds the
sibling decision record by establishing what already existed, where the wire seams
were, and which behaviours had to be proven against the running engine rather than
assumed.

## Findings

### F1 — The `feature_query` backend already existed and was unused by any UI

The engine's `engine-query` filter already applied a glob/regex `feature_query` over a
node's `feature_tags` (any-match, case-insensitive; an empty pattern is dropped; a
malformed regex returns a 400). The glob is an anchored full-match with `*`/`?`
wildcards. The wire shape `{ value, mode: "glob" | "regex" }` already round-tripped
through the dashboard-state normalization, but no front-end surface drove it. Verified
directly against the live engine: a baseline document slice of ~1118 nodes narrowed to
489 for the glob `*dashboard*`, 108 for `*engine*`, and 0 for the anchored bare term
`dashboard` (proving a plain term must be wrapped), while the regex `^dashboard`
returned 489 — so glob, prefix, and regex all apply server-side with no engine change.

### F2 — The engine conjoins `text` and `feature_query`, so one input cannot drive both

The filter's node test applies BOTH the `text` match (over key/title) and the
`feature_query` match (over feature tags) conjunctively, and the dashboard graph filter
forwards the whole filters block to the query. Driving both fields from a single search
input would therefore intersect them and over-restrict the corpus. This is the load-
bearing reason the bar drives `feature_query` ALONE.

### F3 — The rail narrows client-side; the graph narrows server-side; both read one state

The rail's vault tree is a pure client-side projection narrowed from
`dashboardState.filters`, while the graph is filtered by the engine from the same
filters. The engine matches only the RAW feature tags, so matching the human-readable
display string (the user-requested behaviour) is necessarily a client concern; applying
the same glob/regex over each entry's raw tags plus their sanitized display names keeps
the rail a faithful superset that still agrees with the graph.

### F4 — The flyout's open-time position was unstable because the rail reflows on load

The advanced flyout, portalled and fixed beside the rail's button, measured the button
once on open. The rail header reflows as the TanStack-driven content (the vault tree,
the active-filter badge, fonts) lands, which slides the button horizontally; the single
measurement captured a pre-settle position that only corrected on a later resize or
scroll. The established remedy in this codebase is the portal-pinned-canvas settle loop:
a bounded animation-frame re-measure plus a ResizeObserver on the trigger and its
container, with the surface held hidden until the rect settles. Per-frame instrumentation
later confirmed the hardened anchor holds a constant position and the entrance is a fade
with zero translate (no slide).

### F5 — The autofill, button, and right-flying flyout are net-new versus the binding Figma

The binding Figma file carries the rail's "Search or filter…" field, but not an autofill
suggestion dropdown nor a separate Filters button. The new UI is therefore ahead of the
binding source and must be reconciled (designed into Figma plus Code Connect) or recorded
as an accepted divergence under the binding-source discipline.
