---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-08'
step_id: 'S164'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Run Durable lifecycle events and projector feed code review and record the phase audit

## Scope

- `.vault/audit/`

## Description

- Load and follow the `vaultspec-code-review` workflow for the W11.P33 review
  step.
- Read the audit template and use the existing same-day feature audit as the
  rolling audit log.
- Dispatch two `vaultspec-code-reviewer` agents: one for lifecycle
  schema/projector-feed review, and one for apply/outbox integration review.
- Review the changed event and apply code locally against the accepted
  streaming-events/outbox ADR invariants.
- Record reviewer findings in the feature audit.
- Fix the medium findings before closing the step.
- Mark both W11.P33 audit findings resolved with implementation and test
  evidence.

## Outcome

- The W11.P33 review found two medium issues:
  `w11-p33-lifecycle-feed-accepts-unknown-v1-rows` and
  `w11-p33-apply-start-underpublished`.
- The projector-feed issue is resolved: replay now validates known aggregate
  kind, known event kind, lifecycle payload schema, payload schema version,
  wrapped/row event-kind consistency, and payload data before serving a v1 row.
- The apply-start issue is resolved: apply preflight now emits `apply.started`
  in the same unit of work that reserves the in-flight attempt and appends the
  `Applying` ledger revision.
- The successful apply regression now asserts durable outbox ordering:
  `apply.started` followed by `apply.recorded`.
- The feature audit records both findings and their S164 resolutions.

Verification:

- `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::events -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::apply -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store::outbox -- --nocapture`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml --check`

## Notes

- Reviewer agents:
  `019f3865-97ea-77e1-a01f-5bc99117422b` reviewed event schema/feed scope;
  `019f3865-b55f-7613-8f90-64190f24300c` reviewed apply/outbox integration.
  Both agents were closed after completion.
- Event tests passed 6/6 after the S164 fixes. Apply tests passed 12/12. Outbox
  tests passed 9/9.
