---
tags:
  - '#adr'
  - '#left-rail-feature-filter'
date: '2026-06-24'
modified: '2026-06-24'
related:
  - '[[2026-06-24-left-rail-feature-filter-research]]'
  - '[[2026-06-19-filter-controls-adr]]'
  - '[[2026-06-19-filter-consolidation-adr]]'
---

# `left-rail-feature-filter` adr: `Left-rail feature search bar, autofill, and advanced-filter flyout` | (**status:** `accepted`)

## Problem Statement

The left rail's centralized "Search or filter…" field read as both a filter and a
dysfunctional search box, and never delivered real feature filtering. The one
canonical filter surface (the rail, per the filter-consolidation decision) needed a
proper FEATURE filter: live text search, an autofill of the available feature-tag
vocabulary (a missing feature), glob, and advanced (regex) syntax — matching the
human-readable names a user sees AND the raw hyphenated tags. Separately, the
advanced facet controls (kind / status / health) shared the field's surface, so
focusing or keyboard-navigating the field popped the facet flyout, and the two
concepts competed. The engine already shipped a `feature_query` glob/regex backend
(the filter-controls decision) that no UI drove. This ADR records, after the fact,
the decisions made while building the feature search bar, its autofill, and the
relocation of the advanced controls behind a dedicated button.

## Considerations

- The engine applies BOTH `filters.text` (over node key/title) AND
  `filters.feature_query` (over `feature_tags`) conjunctively in `matches_node`, and
  the whole filters block is forwarded to the graph query — so driving both fields
  from one input would over-restrict the corpus.
- `feature_query` (`{value, mode}`) already round-trips through dashboard-state
  normalization but was consumed by no surface.
- The rail tree narrows CLIENT-side; the graph is filtered SERVER-side. Both read the
  one canonical `dashboardState.filters`, so they must narrow identically.
- The engine matches RAW feature tags only; matching the sanitized display string is
  inherently a client concern.
- The design system is centralized: an autocomplete must COMPOSE the kit field, not
  hand-build a second combobox.
- The Figma file is the binding source of truth: an autofill dropdown and a separate
  Filters button are net-new UI not present in the binding field.
- Combobox keys (Arrow / Enter / Escape) are Class-B widget interaction and stay in
  the component, never the central keymap registry.

## Constraints

- No engine change is required or made: the `feature_query` glob/regex filter is
  complete and validated (a malformed regex 400s) in `engine-query`.
- Display-name matching cannot be pushed to the engine (it holds no display strings),
  so the dual-match lives client-side and is a slight superset of what the graph can
  narrow.
- During development the browser automation surfaces were intermittently locked by
  concurrent agents; the UI wiring was proven by render tests against the live
  client, and the full path was later verified live via Playwright and direct engine
  queries.

## Implementation

The decisions, as built:

- **D1 — The feature search bar drives `feature_query`, never `text`.** Keystrokes
  write the canonical backend feature filter (glob/regex over `feature_tags`), not
  the conjunctive `text` field. A plain term becomes a substring glob (`dash` ⇒
  `*dash*`); an explicit glob is sent anchored as typed (`dashboard-*`); a
  `/pattern/` becomes a regex; a regex that will not compile is never written (it
  would 400 the graph query). The parser, the client matcher, and the one display
  sanitizer live in `stores/featureQuery.ts`; the canonical write rides a new
  `setFeatureQuery` mutation, intent seam, and debounced draft hook that mirror the
  existing text-filter ones.

- **D2 — Autofill matches the display string AND the raw tag.** Suggestions come from
  the served feature-tag vocabulary (preloaded, bounded), matched against both the
  sanitized display name and the original hyphenated tag; choosing one fills the bar
  with the raw tag and applies it; glob/regex input bypasses suggestions. One
  sanitizer (`featureTagDisplayName`) is shared by the rail rows, the autofill, and
  the narrow, so "the display string" means one definition everywhere. The field
  composes the centralized kit `SearchField` (extended with combobox passthrough
  props) plus a suggestions listbox.

- **D3 — The rail tree honours `feature_query` client-side.** The rail narrow applies
  the same glob/regex over each entry's raw tags and their display names, so the rail
  agrees with the server-filtered graph; the Files tree narrows by a plain substring
  reduced from the same canonical query, so one bar narrows both tabs.

- **D4 — A dedicated Filters button is the sole opener of the advanced flyout.** The
  flyout opens ONLY on a button press — focusing or keyboard-navigating the search
  bar never opens it. The FEATURE section is removed from the flyout (the search bar
  now owns feature filtering, keeping one canonical surface), leaving kind / status /
  health; the button's badge counts the advanced facets only.

- **D5 — The flyout flies out over the stage, anchored and slide-free.** It is
  portalled to `<body>` as a fixed panel positioned to the right of the button,
  overlaying the graph and open documents rather than being clipped in the rail. The
  anchor (`useFlyoutAnchor`) mirrors the portal-pinned-canvas settle pattern: a
  layout-effect prime, a bounded animation-frame settle loop, and a ResizeObserver on
  the trigger and rail container, with the panel kept hidden until the position has
  settled, then revealed with a fade (not a slide, which ended wherever the
  still-reflowing rail header left the button).

- **D6 — Accepted divergence from the binding Figma.** The autofill suggestion
  dropdown and the dedicated Filters button (and the right-flying flyout) are net-new
  UI not present in the binding Figma file (the rail's "Search or filter…" field
  exists there; the autofill and the separate button do not). This is recorded as an
  ACCEPTED, NAMED divergence under the binding-source discipline, carrying the
  obligation to backfill the Figma design and its Code Connect so the binding source
  regains parity; it is not a licence for further ad-hoc UI.

## Rationale

Driving `feature_query` alone is what makes glob and advanced syntax real corpus
filtering rather than a cosmetic narrow, and it avoids the double-AND over-restriction
the engine would otherwise apply. The dual-match is client-side because the engine has
no display strings to match. The anchor and reveal mechanism reuses the proven
canvas-pin settle discipline so the layout calc is correct regardless of the rail
reflow that lands as the TanStack-driven content loads; the fade replaces the slide
because the slide visibly ended at the wrong position while the button was still
moving. The whole path was verified live: committing a feature narrowed the graph
1138 → 3 nodes and clearing restored it to 1138; the engine's glob and regex narrowing
were confirmed directly; and the flyout's open was instrumented per-frame to show a
constant horizontal position with zero translate (a clean fade, no slide).

## Consequences

Gains: a real, autofilling feature filter with glob and advanced syntax; one canonical
feature surface; a keyboard-safe advanced flyout that overlays the stage; and an anchor
that is robust to open-time reflow. Costs and pitfalls: the rail's display-name match is
a slight superset of what the graph can narrow (acceptable, and the rail is allowed to
be a superset); the new UI is ahead of the binding Figma until D6's design backfill
lands; and under continuous layout churn the flyout can reveal a couple of pixels early
before the ResizeObserver converges (cosmetic, dev-environment only). Pathways: the same
`feature_query` plane can power other feature-scoped surfaces, and `useFlyoutAnchor`
could generalise into a shared anchored-overlay hook if a second portalled popover needs
the same settle guarantees.

## Codification candidates

- **Rule slug:** `feature-search-drives-feature-query`.
  **Rule:** The rail's feature search bar drives the backend `feature_query`
  (glob/regex over `feature_tags`), never `filters.text`, matches BOTH the sanitized
  display string and the raw hyphenated tag, and keeps the advanced facet controls
  behind the dedicated Filters button — never auto-opened by focus or keyboard. (May
  fold into the adjacent backend-served-filterable-state rule rather than stand alone;
  promote only after it holds across a subsequent cycle.)
