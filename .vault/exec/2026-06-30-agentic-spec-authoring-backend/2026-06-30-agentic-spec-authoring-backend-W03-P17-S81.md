---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S81'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Proposal command handlers requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Read the binding W03.P17 plan rows and confirmed S81 is the next unchecked step after W03.P16.
- Ground proposal handlers against the authoring boundary, API contract, changeset ledger, approval gates, apply materialization, rollback history, operation modes, and security provenance ADRs.
- Run `vaultspec-rag search` for proposal handler code grounding and inspect the current authoring modules.
- Inspect `model.rs`, `api.rs`, `ledger.rs`, `transitions.rs`, `validation.rs`, `operations.rs`, `snapshots.rs`, `store/idempotency.rs`, and `store/unit_of_work.rs`.
- Dispatch a read-only sidecar to cross-check the ADR and code implications for P17.

## Outcome

- P17 must implement only the proposal command subset named by the plan: create proposal, append draft, replace draft, validate proposal, submit for review, supersede, cancel, and read proposal snapshot.
- Command handlers must use the shared transition engine. Create starts an authoring changeset at `draft`; append and replace move `draft` or `proposed` back to `draft`; validate moves `draft` or `proposed` to `proposed`; submit moves `draft` or `proposed` to `needs_review`; supersede and cancel append terminal lifecycle records only from cancellable states.
- Submit for review must require the latest approval-ready validation record and must reject missing, stale, invalid, or non-approval-ready validation even though the ledger has legal status arcs.
- Mutating handlers must run inside one `Store::with_unit_of_work` transaction and use the idempotency repository before mutating proposal state. Replays must return the recorded outcome without duplicate ledger, validation, or preimage records; changed request or scope under the same key must conflict.
- Proposal materialization for this phase is the existing W03.P13 whole-document subset: existing-document `replace_body` with `whole_document` draft, current-base snapshot, required preimage, materialized operation, review diff, material digest, and validation digest.
- Proposal snapshots must be backend-reconstructed from ledger history and latest validation state, not from frontend memory or LangGraph checkpoints.
- P17 must not add approval decisions, apply jobs or receipts, rollback generation, actors or authorization policy, operation modes, LangGraph runtime, route expansion, review queues, projections, streams, core adapter calls, direct `.vault/` writes, or new lifecycle vocabulary.
- S83 tests should use real temp worktrees and real authoring store behavior for ordered revision chains, idempotency replay and conflict, validation gates, terminal refusal, supersede/cancel terminal records, and backend-owned snapshot reconstruction.

## Notes

- `proposal.rs` does not exist yet; S82 owns creating it.
- `CreateProposalRequest` exists in `api.rs`; the other proposal subcommands may need internal request types unless route DTOs are expanded later.
- Snapshot reads are not mutating idempotent commands. S82 must avoid pretending snapshot reads are mutating command outcomes merely to reuse existing unit-of-work helpers.
- No destructive git operation was used.
