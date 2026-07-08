---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S13'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add model tests for stable serialization, invalid identifiers, terminal states, and action eligibility

## Scope

- `engine/crates/vaultspec-api/src/authoring/model.rs`

## Description

- Add identifier validation tests for empty, whitespace-padded, unsafe, overlong,
  and deserialized identifier values.
- Add serialization tests for stable snake_case status, command, actor, review,
  and document-reference variants.
- Add lifecycle and status-precheck tests for terminal statuses, review request
  status candidates, and apply request status blockers.
- Add receipt and document-reference tests for actor provenance, idempotency
  identity, provisional creates, renames, and materialized result refs.

## Outcome

Model coverage verifies stable wire vocabulary and prevents status-only helpers
from overclaiming full review or apply eligibility.

## Notes

Verification passed with focused authoring model tests on 8 tests.
