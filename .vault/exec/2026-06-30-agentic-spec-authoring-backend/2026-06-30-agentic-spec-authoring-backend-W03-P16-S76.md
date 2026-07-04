---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S76'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Transition engine and terminal-state validation requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Ground W03.P16 against the changeset-ledger, approval-gates, apply-materialization, rollback-history, authoring-API, and operation-modes ADRs.
- Inspect the existing authoring model, API DTOs, ledger, and validation helpers for status and eligibility vocabulary.
- Dispatch a read-only explorer to cross-check transition scope, phase boundaries, and test expectations.
- Define the implementation target as a pure transition and eligibility decision module.

## Outcome

- W03.P16 must centralize legal changeset status transitions and terminal-state guards in `transitions.rs`.
- V1 apply must allow only the single-child `approved` to `applying` to `applied` path; `partially_applied` and `compensation_required` remain reserved and unreachable until core has batch transactions.
- Rollback is a new `kind=rollback` changeset using the normal lifecycle; rollback must not rewrite the source applied changeset.
- Approval freshness checks must be represented as explicit guard inputs for proposal revision, validation digest, policy version, target revisions, and run cancellation.
- Operation modes must not fork lifecycle states; later auto-approval still enters `approved` before normal apply.
- P16 must not add proposal handlers, approval records, apply receipts, rollback generation, routes, streams, policy storage, core adapter calls, or session persistence.

## Notes

- Tests should exercise concrete helper calls and real authoring structs, not mirror a private transition table.
- No destructive git operation was used.
