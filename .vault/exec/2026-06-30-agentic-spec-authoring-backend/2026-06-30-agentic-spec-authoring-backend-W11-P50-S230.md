---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S230'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify counts and per-document activity are backend-served and rebuildable alongside the Increment 1 eligibility projections

## Scope

- `engine/crates/vaultspec-api/src/authoring/projections.rs`

## Description

- Verify review counts are backend-served from the proposal-list projection and
  computed independently from the bounded list page.
- Verify per-document activity is backend-owned, bounded, durable-sequence
  ordered, and rebuildable from store rows.
- Verify the S229 bounded-read fix remains green under focused and package-level
  tests.
- Validate the plan document and compile the backend crate.
- Attempt to refresh `vaultspec-rag` indexing for the updated vault records.

## Outcome

S230 verified the W11.P50 projection behavior.

Counts:

- `ProposalListProjection` carries `counts`, so the list/recovery snapshot path
  that embeds proposal-list state receives backend-served fixed count buckets.
- `review_counts()` reads latest durable changeset status rows and latest
  durable approval rows independently from `ProposalListProjection.items`.
- Tests prove counts cover more rows than the bounded proposal page returns.

Per-document activity:

- `document_activity()` is a backend repository projection, not a frontend
  inference from list pages or streams.
- The read is bounded by served item cap and an explicit durable-head scan cap.
- Activity items are ordered by durable ledger sequence and include the existing
  backend-served proposal projection.
- Tests prove bounded truncation, stable ordering, document identity variants,
  and rebuild after reopening the store.

Verification commands:

- `cargo test --manifest-path engine/Cargo.toml -p vaultspec-api authoring::projections::tests -- --nocapture`
- `cargo test --manifest-path engine/Cargo.toml -p vaultspec-api -- --nocapture`
- `cargo check --manifest-path engine/Cargo.toml -p vaultspec-api`
- `vaultspec-core vault plan check .vault/plan/2026-06-30-agentic-spec-authoring-backend-plan.md`

## Notes

- `vaultspec-rag` reindex was attempted but the MCP transport closed. This was
  not treated as a code failure because the package test suite's live RAG test
  reported the resident RAG path as exercised and semantically available.
- Plan validation reports the existing `PLAN022` canonical-id ordering warning.
  This phase did not introduce that ordering pattern.
- The S229 reviewer noted that no HTTP route currently calls
  `document_activity()`. S230 accepts the repository projection as the backend
  surface for this projections-only phase and records the route/recovery decision
  as the next integration obligation if frontend or agent clients need direct
  per-document activity over HTTP.
