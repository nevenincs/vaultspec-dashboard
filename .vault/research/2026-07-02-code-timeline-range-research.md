---
tags:
  - '#research'
  - '#code-timeline-range'
date: '2026-07-02'
modified: '2026-07-03'
related:
  - "[[2026-07-02-codebase-graphing-adr]]"
---

# `code-timeline-range` research: `timeline range on the code corpus`

User report: the timeline is inert and inconsistent in code view mode — the range
strip cannot filter code nodes at all. Two read-only code-map passes (engine, then
frontend) traced why, end to end, to ground a decision on how the code corpus should
participate in the timeline.

## Findings

### Engine side

- Code file and module nodes are minted with `dates: None`
  (`ingest-code/src/modules.rs`), even though the ingest walk already stats every
  file and carries `mtime_ms` on `WalkedFile` (`walk.rs`) for the
  `(path, len, mtime)` source-tree fingerprint. mtime is a cache-key ingredient
  today, never node data. No git-time usage exists anywhere in `ingest-code`.
- The `/graph/query` code branch (`vaultspec-api/src/routes/query.rs`,
  `code_corpus_query`) rejects ANY non-default vault `Filter` with a typed 400
  ("vault filter facets do not apply to the code corpus") — and `date_range` /
  `date_field` ride inside `Filter`, so a timeline window sent with `corpus=code`
  trips that gate. `as_of` is likewise rejected ("present view only"). The code
  corpus's own grammar (`CodeNarrow`) is `dir_prefix` + `languages` only.
- Vault date filtering (`engine-query/src/filter.rs`) matches on
  `node.dates → date_key_for(date_field)` with inclusive lexical `yyyy-mm-dd`
  bounds; a missing date is EXCLUDED once a range is set. `Dates.modified` is a
  worktree mtime in ms; `created`/`stamped` are frontmatter strings — code files
  can only ever populate `modified`.
- `/filters` IS corpus-aware on the engine (`?corpus=code` →
  `code_filter_vocabulary` = `{languages, dirs}` only — NO date bounds), so the
  code corpus currently advertises no timeline span at all.
- `/graph/asof` and `/graph/diff` are vault-only (no corpus param); called while
  the dashboard shows code, they still serve VAULT historical slices.

### Frontend side

- The timeline strip (`TimelineRangeSelector.tsx`) fits its edges to
  `dateBoundsByField[criterion]` from `useFiltersVocabulary(scope)` — fetched with
  NO corpus parameter and keyed on scope alone, so in code mode the strip renders
  the VAULT span and is live-but-inert: its `setDateRange` write lands in
  `dashboardState`, but the code graph query sends only
  `{scope, granularity, corpus}` and (since the settle-on-swap hardening) pins its
  identity to a date-range-free filter, so nothing re-keys.
- The client visibility mask (`stores/view/filters.ts` `nodeMatches`) tests only
  doc types, feature tags, and text — dates are engine-side by design — so code
  nodes are not client-masked either. The range filters code nodes on NEITHER side.
- Nothing in the frontend ever sends `dir_prefix`/`languages` (declared on the
  wire client, zero callers); the code legend is display-only by design (CGR-005).
- Time travel is corpus-blind and un-gated: `useTimeTravel` scrubs whenever
  `timeline_mode` is historical, `timeTravelSource.asof/diff` carry no corpus, and
  the commit-menu entry (`commit:view-at-commit`) has no corpus check — a scrub in
  code mode pushes a VAULT historical slice onto the code canvas. A corpus switch
  mid-scrub leaves the timeline mode historical over a present-view code slice.

### Constraints that bind the fix

- Codebase-graphing ADR D5 froze the vault filter shape and fenced facets per
  corpus with typed validation errors — but its own mechanism anticipates additive
  per-corpus facets, so "date range belongs to the code corpus too" is an
  amendment, not a rewrite.
- The one-corpus-filter-authority rule: `dashboardState.filters` (with
  `date_range` written only by the timeline Setter) must stay the single filter
  record; a code date facet must consume the SAME record, not grow a parallel one.
- `filters-vocabulary` and the graph query already carry per-corpus identity in
  TanStack keys (corpus is a key component on the graph read; the vocabulary read
  must gain one).
