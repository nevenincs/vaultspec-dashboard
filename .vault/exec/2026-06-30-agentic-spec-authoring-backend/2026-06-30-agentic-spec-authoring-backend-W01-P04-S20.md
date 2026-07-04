---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S20'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify every endpoint family has a versioned DTO fixture and a negative contract case

## Scope

- `engine/crates/vaultspec-api/src/authoring/api.rs`

## Description

- Verify the endpoint-family inventory against the V1 route fixture list.
- Verify each fixture route is under the `/authoring/v1/` namespace.
- Verify each endpoint family exposes at least one negative contract case.
- Verify mutating route fixtures require idempotency and read fixtures do not.
- Verify all request, response, list, typed error, degraded snapshot, and event
  fixtures carry V1 schema identity.

## Outcome

W01.P04 endpoint-family coverage is complete for the planned fixture layer:
session, document, proposal, review, apply, rollback, lease, stream, and
recovery are all represented with versioned DTO fixtures and negative contract
cases.

## Notes

This verification intentionally covers endpoint families, not the full handler
route matrix. Handler routes and live request/response behavior are scheduled in
later implementation phases.
