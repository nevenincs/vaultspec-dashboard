---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S12'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement typed aggregate identifiers, command names, lifecycle enums, actor references, document references, and receipt references

## Scope

- `engine/crates/vaultspec-api/src/authoring/model.rs`

## Description

- Add `model.rs` as the authoring-domain vocabulary module.
- Define validated token-backed identifiers for actors, changesets, sessions,
  runs, proposals, approvals, leases, receipts, idempotency keys, revisions,
  tool calls, interrupts, and LangGraph references.
- Define actor references, document references, command kinds, changeset
  statuses, review decisions, apply states, receipts, LangGraph refs, and
  action eligibility records.
- Represent provisional create collision status and source/result document refs
  without exposing core-shaped collaborator verbs.

## Outcome

The authoring model now has typed aggregate identifiers and semantic command
vocabulary for later DTO, handler, store, and agent-tool phases.

## Notes

The module is intentionally crate-private through the fenced authoring namespace
and carries a phase-scoped dead-code allowance until downstream phases wire the
types into handlers.
