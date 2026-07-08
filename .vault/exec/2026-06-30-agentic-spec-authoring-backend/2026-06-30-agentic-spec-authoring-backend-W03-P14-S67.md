---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S67'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement validation digests, stale-input checks, validation status records, warning states, and blocking error records

## Scope

- `engine/crates/vaultspec-api/src/authoring/validation.rs`

## Description

- Add `authoring::validation` as the backend-owned validation material module.
- Define validation status records, warning findings, blocking findings, stale findings, material digests, and validation digests.
- Compute validation records from whole-document `MaterializedProposalOperation` values, current revision observations, and optional chunk evidence.
- Detect stale base revisions, stale chunk evidence, missing current revision observations, material integrity mismatches, and structurally invalid frontmatter envelopes.
- Add submit-for-review eligibility over a matching fresh validation digest without creating approval, apply, route, stream, or ledger state.
- Add schema version 6 with `authoring_validation_records` for durable validation digest persistence.

## Outcome

- W03.P14 now has deterministic validation product state for reviewed proposal material.
- `valid` and `valid_with_warnings` are approval-ready; `invalid` and `stale` are not.
- Missing chunk evidence is represented as a warning for the whole-document walking skeleton instead of requiring the deferred chunk API.
- Stale chunk evidence and changed base revision observations are blocking stale findings.
- Validation records can be stored and loaded through the authoring unit of work.
- `cargo test -p vaultspec-api authoring -- --nocapture` passed with 122 authoring tests.
- `cargo clippy -p vaultspec-api --all-targets -- -D warnings` passed.

## Notes

- Invalid frontmatter support is intentionally structural and bounded in this phase. Full conformance remains dependent on the later core adapter capability registry.
- No approval records, apply jobs, route handlers, streams, LangGraph tool aliases, section selectors, or ledger lifecycle transitions were added.
- No destructive git operation was used.
