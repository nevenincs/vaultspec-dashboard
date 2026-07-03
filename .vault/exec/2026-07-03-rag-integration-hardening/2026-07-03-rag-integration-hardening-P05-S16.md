---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S16'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# Record the stop_failed tiers decision at the stop handler: the tiers block reports true current service state and the failure lives in the envelope status

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added a code comment inside `stop_rag_service` above the `super::envelope` call recording the tiers-on-stop_failed decision (ADR D5 / T1-R3): the tiers block reports true current service state from `query_tiers` — not the outcome of the stop attempt — so a failed stop with rag still running correctly shows the semantic tier available; callers must read the envelope `status` field, never infer from tiers.

## Outcome

Doc-only change. No behavior modification, no new tests. Gate run (`cargo fmt --check`, `cargo clippy`, `cargo test -p vaultspec-api`) passes clean.

## Notes

This step closes the ADR silence on T1-R3: the behavior was always correct; the constraint was simply undocumented at the code site.
