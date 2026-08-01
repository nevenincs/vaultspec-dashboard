---
tags:
  - '#research'
  - '#rail-feature-metadata'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:e5af5b053b3ae86e4650c75e30e807844fe4598c4c771237d05035b322fad005'
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
2. A new per-feature metadata route — rejected: the roster is already the per-feature read; a second route fragments caching.
3. Client-side derivation from listings — rejected outright by the counts/complete-set law.
