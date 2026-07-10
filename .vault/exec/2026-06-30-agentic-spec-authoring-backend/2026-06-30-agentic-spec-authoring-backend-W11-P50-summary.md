---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-08'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# `agentic-spec-authoring-backend` `W11.P50` summary

W11.P50 completed the Increment 3 remainder for review count rollups and
per-document activity projections.

- Modified: `engine/crates/vaultspec-api/src/authoring/projections.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/store/unit_of_work.rs`
- Modified: `.vault/plan/2026-06-30-agentic-spec-authoring-backend-plan.md`
- Modified: `.vault/audit/2026-07-06-agentic-spec-authoring-backend-audit.md`
- Created: W11.P50 step records for S226, S227, S228, S229, and S230.

## Description

The phase grounded the projection requirements, implemented fixed full-corpus
review counts, implemented a bounded per-document activity projection, added
real-store tests, ran formal review, fixed the review-blocking bounded-read
issue, and verified the resulting projection behavior.

Completed behavior:

- Proposal-list projection carries backend-served count buckets.
- Counts are computed from latest durable changeset and approval rows, not from
  the bounded proposal page.
- Per-document activity is a backend projection with stable document identity
  keys, durable sequence ordering, item cap, scan cap, and rebuild behavior.
- Activity identities cover existing documents, provisional creates, rename
  targets, and materialized results.
- Repository streaming support avoids materializing full activity scans before
  filtering.

Review status:

- High review issue resolved: activity reads now stream under an explicit scan
  cap.
- Medium review issue accepted for integration follow-up: no HTTP route
  currently calls `document_activity`; S230 records this as the next surface
  decision if frontend or agent clients need direct per-document activity over
  HTTP.

Verification:

- `cargo test --manifest-path engine/Cargo.toml -p vaultspec-api authoring::projections::tests -- --nocapture`
- `cargo test --manifest-path engine/Cargo.toml -p vaultspec-api -- --nocapture`
- `cargo check --manifest-path engine/Cargo.toml -p vaultspec-api`
- `vaultspec-core vault plan check .vault/plan/2026-06-30-agentic-spec-authoring-backend-plan.md`

Known non-blocking notes:

- The plan check reports the existing `PLAN022` canonical-id ordering warning.
- `vaultspec-rag` MCP reindex attempts failed with a closed transport in this
  session, while the package test suite's live RAG test still exercised the
  resident RAG path successfully.
