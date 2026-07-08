---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S16'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground V1 DTO schema and route fixtures requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Review the accepted API contract, changeset ledger, document identity,
  concurrency, LangGraph, streaming, apply, and rollback ADRs for V1 DTO
  constraints.
- Distill the W01.P04 checklist into semantic endpoint families: session,
  document, proposal, review, apply, rollback, lease, stream, and recovery.
- Require versioned DTOs, idempotent mutating command envelopes, tier-compatible
  responses, strict unknown-field rejection, semantic non-core command names,
  and negative contract cases per endpoint family.
- Carry forward the sidecar research requirement that proposal/apply/rollback
  fixtures model multi-document changesets with child operations and target
  revision fences, even while handler/store work remains later-phase scope.

## Outcome

The W01.P04 implementation target was narrowed to DTOs, route fixtures, and
contract tests only. Handler routing, persistence, transitions, event outbox
storage, leases, and core materialization remain later plan phases.

## Notes

No code-generation or materialization behavior was added in this step.
