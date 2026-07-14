---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace feature-group-authoring with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- PHASE SUMMARY:
     This file rolls up every <Step Record> belonging to one Phase
     of the originating plan. Each Step (S##) in the Phase produces
     one <Step Record> in `.vault/exec/`; this summary aggregates
     them, lists modified / created files across the Phase, and
     reports verification status. -->

# `feature-group-authoring` `P02` summary

<!-- Brief summary of overall progress across every Step in this Phase,
     followed by a list of files touched across the Phase, e.g.:
     - Modified: `{file1}`
     - Created: `{file2}` -->

## Description

P02 delivered the engine feature-coverage projection (ADR D2/D3/D4), executed
by a delegated coder and adversarially reviewed. S04 built the projection with
its eligibility law (research/reference always; adr iff an entry point exists;
plan iff adr; audit always with a no-upstream advisory; exec never from this
surface), deterministic newest-stem selection, next-step derivation, and the
500-feature roster cap — 11 unit tests. S05 memoized the whole-corpus map per
graph generation on the corpus cell, byte-for-byte the filters-vocabulary
idiom, with a memo test. S06 served GET /features (per-feature coverage or
roster) through the shared envelope with tiers on success and error, bearer-
gated and drift-guard enrolled, with 4 end-to-end route tests over a real
worktree; an unknown feature serves an all-missing coverage (the start-a-new-
feature state), never a 404.

- Created: `engine/crates/engine-query/src/features.rs`
- Created: `engine/crates/vaultspec-api/tests/feature_coverage_routes.rs`
- Modified: `engine/crates/engine-query/src/lib.rs`, `engine/crates/vaultspec-api/src/app.rs`, `engine/crates/vaultspec-api/src/routes/query.rs`, `engine/crates/vaultspec-api/src/lib.rs`, `engine/crates/vaultspec-api/src/routes/spa.rs`
- Modified: `frontend/scripts/module-size-baseline.json` (+2 for the unavoidable route-registration lines in the grandfathered `lib.rs`)

Verification: fmt/clippy clean on both crates; 11 + 4 + 1 tests green,
independently re-run by the principal and by the reviewer. Review verdict
APPROVED, no CRITICAL/HIGH; three LOW findings: the cold-first-read comment
implied warming that does not happen (comment corrected in-session to state
the deliberate lazy choice); the transient scan accumulator is unbounded
pre-cap exactly like its filter-vocabulary precedent (recorded, no change);
`missing` includes exec, which the P04 chrome must not render as an
actionable link (carried into the P04 instructions). One named future-test
gap: the out-of-order adr-without-research case pinning next_step.
