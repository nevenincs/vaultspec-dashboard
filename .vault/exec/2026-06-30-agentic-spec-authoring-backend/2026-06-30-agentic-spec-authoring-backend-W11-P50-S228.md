---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S228'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add projection tests for count rollups, per-document activity feeds, and bounded activity reads

## Scope

- `engine/crates/vaultspec-api/src/authoring/projections.rs`

## Description

- Add real-store tests proving list counts cover the full corpus beyond the
  bounded proposal page.
- Add real-store tests for latest status buckets and approval queue buckets.
- Add bounded per-document activity tests for durable sequence ordering,
  truncation, and reopen/rebuild behavior.
- Add activity identity coverage for existing documents, provisional creates,
  rename targets, and materialized results.
- Tighten the list-projection body-leak assertion so fixed status-count keys do
  not look like document bodies.
- Run focused and package-level verification.

## Outcome

`S228` added coverage for the W11.P50 projections in `projections.rs` without
fakes, mocks, stubs, monkeypatches, skips, or xfails.

Coverage added:

- `list_projection_is_bounded_and_reports_truncation` now asserts the proposal
  page is capped while `page.counts.total_changesets` and status counts cover
  rows beyond the page.
- `review_counts_roll_up_latest_statuses_and_approval_queues` seeds durable
  ledger and approval rows, including a real approval decision, and asserts
  draft/needs-review/approved plus queued/closed counts.
- `document_activity_is_bounded_ordered_and_rebuildable` asserts per-document
  activity is capped, reports truncation, orders by durable ledger sequence, and
  rebuilds after reopening the store.
- `document_activity_groups_all_document_ref_identity_variants` asserts activity
  keys work for existing, provisional-create, rename-target, and
  materialized-result document identities.

Verification:

- `cargo fmt --manifest-path engine/Cargo.toml --package vaultspec-api`
- `cargo test --manifest-path engine/Cargo.toml -p vaultspec-api authoring::projections::tests -- --nocapture`
- `cargo test --manifest-path engine/Cargo.toml -p vaultspec-api -- --nocapture`

The focused projection run passed `15` tests. The full package run passed with
exit code `0`.

## Notes

- The first focused run failed because an existing assertion rejected the
  substring `proposed`; fixed status-count keys now legitimately include names
  such as `rollback_proposed`. The assertion was narrowed to body/detail leakage
  (`review_documents`, `payload_text`, and proposed body content).
- The full package test output includes existing diagnostic logs from tests that
  intentionally exercise missing temporary `.vaultspec` directories and watcher
  startup failures. The test command still exited green.
