---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S91'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Actor model and delegated scopes requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Read the rewritten P19 phase text, the agentic reference, the provenance/security, API contract, ledger, state store, outbox, LangGraph, approval, and operation-mode ADRs.
- Ground the phase against the live authoring code: `ActorId`, `ActorKind`, `ActorRef`, `CommandEnvelope`, idempotency actor scope, outbox actor storage, proposal command context, and changeset ledger records.
- Resolve the P19 scope conflict by treating the phase narrative as binding over stale S92 row wording.
- Derive the implementation, test, verification, and deferral checklist for S92 through S95.

## Outcome

P19 is scoped as the minimal actor/provenance subset for the walking skeleton.
The backend must model human and agent actor identity, stable provenance keys,
and ledger attribution now. Full service identities, granted delegated scopes,
permission enforcement, and operation-mode policy remain deferred to the later
security and mode phases.

S92 implementation checklist:

- Add `authoring::actors` as the actor registry module and keep `ActorRef` as
  a reference shape, not as display/profile payload.
- Add durable authoring-store actor records for human and agent actors:
  actor id, actor kind, display metadata, lifecycle/staleness state,
  timestamps, and a canonical provenance key.
- Define provenance keys from stable identity inputs: actor kind, actor id, and
  optional `delegated_by` actor id. Exclude display metadata, timestamps,
  idempotency keys, request digests, LangGraph run/checkpoint ids, model ids,
  provider ids, and other volatile execution fields.
- Treat `ActorRef.delegated_by` as provenance only in this subset. Do not
  implement granted scopes, scope policy, or delegated authorization.
- Validate command actors against the registry before mutation side effects.
  Missing or stale actors must fail before ledger writes, preimage writes,
  validation writes, idempotency outcomes, or outbox emission.
- Attribute every changeset ledger revision to the issuing command actor.
  Thread the actor and provenance key through `ChangesetRevisionInput`,
  `ChangesetAggregateRecord`, ledger persistence, and ledger reads.
- Include actor/provenance fields in ledger integrity hashing so attribution is
  tamper-evident under the existing aggregate digest and revision digest
  verification pattern.
- Preserve existing actor-scoped idempotency and outbox behavior, including the
  `delegated_by` distinction already present in storage keys.
- Serve display metadata from actor records or later projections. Do not widen
  `CommandEnvelope.actor` to accept display data.

S93 and S95 test checklist:

- Use real temporary SQLite authoring stores and real command handlers.
- Cover human actor create/read/reopen, agent actor create/read/reopen,
  duplicate actor behavior, missing actor refusal, stale actor refusal, and
  actor display metadata persistence.
- Prove provenance key stability across display metadata changes and restart,
  and prove key changes when actor id, actor kind, or `delegated_by` changes.
- Prove provenance keys exclude timestamps, display names, idempotency keys,
  request digests, and runtime identifiers.
- Prove missing or stale actors produce no ledger, preimage, validation,
  idempotency outcome, or outbox side effects.
- Prove proposal mutations carry actor attribution on create, draft append,
  draft replace, validate, submit, cancel, and supersede ledger revisions.
- Prove ledger digest verification catches actor/provenance tampering.
- Prove delegated actor references round-trip through idempotency and outbox
  storage without collapsing distinct actor scopes.

Explicit deferrals:

- Service identity records, provider/model identity, LangGraph run or
  checkpoint identity, capability negotiation, granted scope records, and
  permission matrices.
- Authorization guards, dangerous-tool guards, redacted policy failures, and
  delegated scope enforcement.
- Operation modes, system-actor auto-approval, approval/apply self-approval
  enforcement, and review-state policy.
- Routes, frontend display work, core adapter calls, direct `.vault` writes,
  and git mutation.

## Notes

The S92 row still names service identities and delegated scopes, but the
rewritten phase prose and reference narrow P19 to human/agent identity and
stable provenance. Implementing full service identity or delegated-scope
enforcement in S92 would overrun the amended walking-skeleton scope.

No code files changed in S91. The next implementation step should start from
`engine/crates/vaultspec-api/src/authoring/model.rs`,
`engine/crates/vaultspec-api/src/authoring/store/mod.rs`,
`engine/crates/vaultspec-api/src/authoring/ledger.rs`,
`engine/crates/vaultspec-api/src/authoring/proposal.rs`, and
`engine/crates/vaultspec-api/src/authoring/store/outbox.rs`.
