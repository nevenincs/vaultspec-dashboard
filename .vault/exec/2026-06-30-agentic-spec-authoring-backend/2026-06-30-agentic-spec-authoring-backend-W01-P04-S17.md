---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S17'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement V1 DTOs and route fixtures for sessions, documents, proposals, reviews, apply, rollback, leases, streams, and recovery

## Scope

- `engine/crates/vaultspec-api/src/authoring/api.rs`

## Description

- Add the private `authoring::api` module for V1 schema fixtures.
- Define endpoint-family and route fixtures for session, document, proposal,
  review, apply, rollback, lease, stream, and recovery surfaces.
- Add command and read envelopes with explicit `api_version`, semantic command
  names, actor identity, and idempotency keys for mutating commands.
- Add V1 request DTOs for session creation, document snapshots, multi-child
  proposal creation, review decisions, per-child apply expectations, explicit
  rollback child sources, leases, event streams, and recovery reads.
- Add response DTOs for command receipts, list pages, snapshots, typed errors,
  degraded snapshots, and lifecycle events.
- Tighten nested wire structs including actor refs, document refs, LangGraph
  refs, receipt refs, action eligibility, and aggregate refs with strict
  unknown-field handling.

## Outcome

The V1 fixture surface now exposes semantic authoring contracts while keeping
core verbs hidden. Proposal, apply, and rollback fixtures carry child operations
and target revision fences instead of collapsing to a single document target.

## Notes

DTOs and fixtures are intentionally marked as currently unused by runtime
handlers; later phases wire them into stores, transitions, events, and tools.
