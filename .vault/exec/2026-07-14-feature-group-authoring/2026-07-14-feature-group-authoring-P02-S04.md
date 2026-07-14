---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S04'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace feature-group-authoring with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S04 and 2026-07-14-feature-group-authoring-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Build the feature-coverage projection (present directory types with newest stem, missing types, per-type eligibility, next-step token) over the LinkageGraph, bounded and unit-tested, following the filter-vocabulary analogue and ## Scope

- `engine/crates/engine-query/src/features.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Build the feature-coverage projection (present directory types with newest stem, missing types, per-type eligibility, next-step token) over the LinkageGraph, bounded and unit-tested, following the filter-vocabulary analogue

## Scope

- `engine/crates/engine-query/src/features.rs`

## Description

- Add a new `engine-query` module `features` and wire it into the crate's `lib.rs`
  module list, mirroring the sibling `filter` and `pipeline` projections.
- Define the wire types: `TypeCoverage` (per pipeline doc type: present flag,
  count, newest stem, eligibility, and a single reason/advisory token),
  `FeatureCoverage` (feature tag, per-type coverage, missing-type list, next-step
  token), `FeatureRosterEntry` (compact feature + counts + next step), and
  `CoverageMap` (the whole-corpus map that serves both the per-feature read and
  the roster).
- Implement `coverage_map` as one pass over the document nodes: group each
  pipeline-typed node under every feature tag it carries, tracking per-type count
  and newest stem, then derive each retained feature's coverage.
- Derive per-type eligibility per the ADR hierarchy gate: research and reference
  always eligible; adr eligible when research or reference is present; plan
  eligible when adr is present; exec never eligible from this surface; audit
  always eligible with a no-upstream advisory when nothing upstream exists.
- Derive the served next-step token as the first unmet link along the
  research/reference then adr then plan chain, absent once a plan exists.
- Add unit tests: unobserved feature (all-missing, entry advised), research-only,
  reference-alone, research-and-adr, full-chain-no-next-step, exec exclusion,
  newest-stem selection (date prefix then stem order), multi-feature-tag
  attribution, non-pipeline/typeless exclusion, roster counts, and the roster cap.

## Outcome

The projection compiles and its eleven unit tests pass
(`cargo test -p engine-query features`, 11 passed). `cargo fmt -p engine-query`
and `cargo clippy -p engine-query --all-targets` are both clean. The module is
571 lines, well under the module-size cap. Coverage is computed over the full
corpus with no node ceiling, so it never lies about what exists, and every
displayed/classification value (present, eligible, next step) is engine-derived
per the wire-contract law rather than left to a client narrow.

## Notes

Judgment calls recorded here:

- Newest stem is selected by the pair (date prefix, full stem): vault stems lead
  with the ISO date, so this is newest-by-date with a lexical stem tiebreak,
  matching the step contract. A helper extracts the ten-char date prefix and
  falls back to an empty prefix for an unconventional stem (it then sorts oldest).
- Newest, missing, eligibility, and next step are all derived from ONE presence
  signal in a single builder, so a new feature (unobserved, or beyond the roster
  cap) reads as an all-missing coverage advising the entry point rather than a
  404, which is exactly the panel's start-a-new-feature state.
- The roster cap is a shared const of 500, referencing the resource-bounds rule;
  the served map/roster is hard-capped to the lexicographically-first features.
  The transient per-feature accumulator is inherently corpus-bounded, the same
  discipline `filter::vocabulary` uses when it collects feature tags.
- Per-type ineligibility carries one plain reason token (requires-research-or-
  reference, requires-adr, plan-derived, no-upstream) so the dumb chrome maps it
  to a user-facing string, keeping internal vocabulary off screen.
