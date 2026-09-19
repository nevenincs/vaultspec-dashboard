---
tags:
  - '#research'
  - '#rail-feature-metadata'
date: '2026-08-01'
modified: '2026-09-19'
body_schema: 'body-v1'
body_hash: 'sha256:bdae310e1ac7084e63bd1d6addb450243f999f35e7476ceab12f8416d00a71ad'
related: []
---

# `rail-feature-metadata` research: `feature rows that say status, age, and composition`

## Question

Three owner notes ask the feature rows (rail Features section, feature search suggestions, rail filter field) to carry real metadata: a status mark in the icon slot ("checkmark for finished plans, icon for in progress"), a date — possibly a RANGE over the binding ADRs ("needs proper design decision what the range should represent"), and per-type document counts instead of a duplicated tag line. What does the wire serve today and what must be added?

## Findings

- Served today per feature (`FeatureRosterEntry`, roster route): `feature`, `doc_count` (total), `types_present` (a count, not a breakdown), `next_step` (optional hint). The feature filters vocabulary serves tag lists only. Per-TYPE counts, any DATE, and any PLAN-STATE rollup are NOT served.
- The per-scope pipeline projection already serves plan artifacts with `progress {done,total}`, `tier`, `feature_tags`, and `dates {created,modified}` — the engine holds everything needed to roll up a per-feature plan state and date span; the client must not re-derive these over capped listings (counts law).
- The rail's feature group headers already render `doc_count`-style counts from served values; the second-line duplication in the filter field is a presentation bug already noted for direct fix — the METADATA content is what needs the wire.
- Date semantics candidates for the range: (a) span of the feature's binding ADR dates (owner's suggestion — "date could be the date of the binding adrs"; multiple ADRs ⇒ first..last), (b) full corpus span (first doc..last modified), (c) creation date only. The owner explicitly flags this as the design decision to make.
- Status semantics: a feature may carry several plans. An honest rollup: `finished` iff every plan is finished; `in-progress` iff any plan is in progress; `planned` iff plans exist but none started; absent when the feature has no plan. Mirrors the served `plan_state` vocabulary; computed engine-side over the full set.

## Options carried forward

1. Extend `FeatureRosterEntry` with `type_counts` (map doc-type→count), `plan_state` (rollup token), and `adr_dates {first,last}` (the owner's binding-ADR span), consumed by rail rows, search suggestions, and the filter field. (Recommended.)
1. A new per-feature metadata route — rejected: the roster is already the per-feature read; a second route fragments caching.
1. Client-side derivation from listings — rejected outright by the counts/complete-set law.

## Sources

- Owner input, dated 2026-08-01: three owner notes asking the feature rows (rail Features section, feature search suggestions, rail filter field) to carry a plan-state mark, a date range over binding ADRs, and per-type document counts — not a fetchable source, recorded as the request grounding this research.
- `frontend/src/stores/server/engine/graphTypes.ts:837` — the served `FeatureRosterEntry` shape: `feature`, `doc_count`, `types_present`, `next_step?`, plus `type_counts?`, `plan_state?`, `adr_dates?`.
- `engine/crates/engine-query/src/features.rs` — the roster/coverage projection (`roster()`, `coverage_for()`, `coverage_map()`) that groups pipeline documents by `feature_tags` and serves the per-feature counts and next-step hint.
- `engine/crates/engine-query/src/pipeline.rs:111` — `PipelineArtifact`, the per-scope pipeline projection carrying `tier` and checkbox `progress {done, total}` for in-flight plans.
- `engine/crates/engine-model/src/lib.rs:267` and `:271` — the `Node` model's `dates: Option<Dates>` and `feature_tags: Vec<String>` fields; `:318` — the `Dates` struct (`created`, `modified`, `stamped`).
- `frontend/src/stores/server/engine/statusTypes.ts:454` — the `plan_state` (`not-started`/`in-progress`/`finished`) vocabulary the feature-level rollup mirrors.
- `frontend/src/app/left/featureRowPresentation.ts` — the rail's existing composition-line rendering of served per-type counts (`type_counts`), the consumer this research's recommendation extends.
