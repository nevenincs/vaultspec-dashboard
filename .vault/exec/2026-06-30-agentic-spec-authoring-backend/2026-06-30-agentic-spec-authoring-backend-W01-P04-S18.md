---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S18'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add schema fixture tests for versioning, idempotency fields, unknown-field rejection, tiers, and route-family negative cases

## Scope

- `engine/crates/vaultspec-api/src/authoring/api.rs`

## Description

- Test that every endpoint family has a versioned authoring route fixture and a
  negative contract case.
- Test that every request and response fixture carries V1 schema identity.
- Test idempotency-key requirements and unknown-field rejection at envelope,
  payload, actor, LangGraph, document-ref, and aggregate nesting levels.
- Test future-version rejection for requests and event schemas.
- Test that route and command fixtures remain semantic and do not expose core
  shaped verbs.
- Test tiered response wrapping, list/error/degraded fixtures, lifecycle event
  naming, provisional document identity, document aggregate identity, and
  command receipt provenance.
- Test that proposal, apply, and rollback fixtures carry child operations and
  revision fences.

## Outcome

The focused authoring API test set covers W01.P04 DTO schema invariants without
mocked business logic or handler fakes.

## Notes

Verification commands run after the final fix: focused authoring API tests, the
full `vaultspec-api` library suite, and `just dev lint rust`.
