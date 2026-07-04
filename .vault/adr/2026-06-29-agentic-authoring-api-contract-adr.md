---
tags:
  - '#adr'
  - '#agentic-spec-authoring-backend'
date: '2026-06-29'
modified: '2026-07-03'
related:
  - "[[2026-06-29-agentic-spec-authoring-backend-research]]"
  - "[[2026-06-29-langgraph-approval-document-editing-research]]"
  - "[[2026-06-29-zed-acp-document-authoring-research]]"
  - "[[2026-06-29-agentic-authoring-boundary-adr]]"
  - "[[2026-06-29-agentic-changeset-ledger-adr]]"
  - '[[2026-06-29-agentic-authoring-state-store-adr]]'
  - '[[2026-06-29-agentic-change-format-and-chunking-adr]]'
  - '[[2026-06-29-agentic-concurrency-leases-conflicts-adr]]'
  - '[[2026-06-29-agentic-approval-gates-review-state-adr]]'
  - '[[2026-06-29-agentic-langgraph-integration-adr]]'
  - '[[2026-06-29-agentic-streaming-events-outbox-adr]]'
  - '[[2026-06-29-agentic-apply-materialization-adr]]'
  - '[[2026-06-29-agentic-rollback-history-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
  - '[[2026-06-29-agentic-live-editing-room-adr]]'
  - '[[2026-06-29-agentic-review-station-state-adr]]'
  - '[[2026-06-29-agentic-document-chunk-management-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-06-29-agentic-document-identity-adr]]'
---

# `agentic-authoring-api-contract` adr: `V1 authoring API and endpoint contract` | (**status:** `accepted`)

## Problem Statement

The authoring boundary ADR says humans, frontend stores, and LangGraph agents
must integrate through the Rust authoring API, but the corpus needs a scoped V1
interface contract so implementation does not drift back into ad hoc core-shaped
routes or implicit agent tools.

## Considerations

The API must serve both frontend workflows and agent tool calls. It must expose
semantic authoring objects, not `vaultspec-core` verbs. Mutating commands must be
idempotent because LangGraph interrupts and network retries can replay work.
Displayed state, review queues, action eligibility, conflict reasons, and
snapshot recovery must be backend-served through the stores layer.

## Constraints

The authoring API belongs to the fenced authoring backend domain or sibling
service, not to the read/infer engine. Every HTTP, snapshot, recovery, and error
response uses the shared envelope with `tiers`. Raw token and live progress
frames may be compact, but every recovery path returns a tiered snapshot or
durable-event replay response. Agents may call agent-facing tool endpoints, but
those tools are thin aliases over the same domain commands that the frontend
uses.

## Implementation

V1 exposes these semantic endpoint families:

- session and run commands: create authoring session, read session snapshot,
  start prompt turn, cancel session/run, and resume an interrupted run;
- document resources: read document snapshot, read revision snapshot, list
  revision metadata, and diff revisions (bounded chunk reads are the deferred
  chunk contract owned by the change-format-and-chunking ADR; V1 serves bounded
  document content, not a chunk API);
- proposal commands: create proposal, append or replace draft material, submit
  for review, validate, rebase, supersede, cancel, and read proposal snapshot;
- review commands: list review-station items, claim/release item, submit
  approve/reject/edit/respond decisions, and read approval state;
- apply commands: request apply, read apply job/receipt, and surface staged or
  partial materialization state;
- rollback commands: create rollback proposal, validate rollback, approve/apply
  rollback through the normal apply path, and read rollback availability;
- lease commands: acquire, renew, release, and list scoped advisory leases;
- stream commands: subscribe to durable authoring events by `last_seq` and fetch
  a tiered snapshot plus next sequence for recovery.

Every mutating endpoint accepts an idempotency key in a consistent request field
or header and records the scoped command outcome. The command scope includes
actor, aggregate id, operation kind, and target revision where applicable. The
same key replays to the recorded outcome or current in-flight state.

**Denials are values; errors are faults** (DECIDED 2026-07-04, W03.P39 route
grounding; this amendment owns the wire error taxonomy). The wire contract
requires a client to distinguish "your request was refused" from "a backend is
down", so the two ride DIFFERENT lanes and are never conflated in one error
type. A policy or eligibility refusal — ineligible transition, stale approval,
self-approval ban, capability limit — is a DOMAIN OUTCOME: it rides the
SUCCESS envelope as a denied `ActionEligibility` (allowed=false plus an honest
reason), exactly as the approvals and apply command handlers already return
it; a denial is never encoded as a store or infrastructure error. The error
envelope is reserved for genuine faults, mapped by category: infrastructure
failures (SQLite, IO, schema/migration, serialization, subprocess) are server
faults; a malformed or invalid request payload is a client validation fault;
an idempotency-key conflict with a different recorded request is a conflict.
Any domain error variant that mixes refusals with faults (the
`StoreError::Ledger` overload) must be split or — preferred — realigned so the
refusal returns as a denied outcome, leaving the variant purely
infrastructure. A route never guesses a status from a conflated variant, and
never maps a possible backend fault to a client-fault status.

## Rationale

This contract keeps the API semantic and product-oriented while leaving exact
route names, schemas, and transport bindings to implementation. It is specific
enough to wire frontend stores and LangGraph tools without exposing core or
letting agents invent their own state transitions.

## Consequences

The implementation has a clear checklist for endpoints and tool aliases. The
cost is that every operation must pass through typed command handling rather than
thin route wrappers. This makes implementation slower than direct core calls,
but it preserves approval, idempotency, projection, and audit guarantees.

## Codification candidates

- **Rule slug:** `authoring-api-exposes-semantic-commands`.
  **Rule:** Authoring endpoints and agent tools expose sessions, proposals,
  reviews, leases, apply, rollback, and streams as semantic domain commands;
  they never expose `vaultspec-core` verbs as the public contract.

(The idempotency-key obligation is owned by the changeset-ledger ADR's
`authoring-mutating-commands-are-idempotent` candidate; this contract's request
field/header and scope composition above are its API-surface realization, not a
second rule.)
