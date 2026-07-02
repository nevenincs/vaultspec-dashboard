---
tags:
  - '#adr'
  - '#agentic-spec-authoring-backend'
date: '2026-06-29'
modified: '2026-06-30'
related:
  - "[[2026-06-29-agentic-spec-authoring-backend-research]]"
  - "[[2026-06-29-langgraph-approval-document-editing-research]]"
  - "[[2026-06-29-zed-acp-document-authoring-research]]"
  - "[[2026-06-16-document-editor-backend-adr]]"
  - "[[2026-06-18-document-edit-hardening-adr]]"
  - '[[2026-06-29-agentic-authoring-boundary-adr]]'
  - '[[2026-06-29-agentic-authoring-state-store-adr]]'
  - '[[2026-06-29-agentic-changeset-ledger-adr]]'
  - '[[2026-06-29-agentic-change-format-and-chunking-adr]]'
  - '[[2026-06-29-agentic-concurrency-leases-conflicts-adr]]'
  - '[[2026-06-29-agentic-approval-gates-review-state-adr]]'
  - '[[2026-06-29-agentic-langgraph-integration-adr]]'
  - '[[2026-06-29-agentic-streaming-events-outbox-adr]]'
  - '[[2026-06-29-agentic-apply-materialization-adr]]'
  - '[[2026-06-29-agentic-rollback-history-adr]]'
  - '[[2026-06-29-agentic-live-editing-room-adr]]'
  - '[[2026-06-29-agentic-authoring-api-contract-adr]]'
  - '[[2026-06-29-agentic-review-station-state-adr]]'
  - '[[2026-06-29-agentic-document-chunk-management-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-06-29-agentic-document-identity-adr]]'
  - '[[2026-07-02-agentic-operation-modes-adr]]'
---

# `agentic-security-provenance` adr: `actor permissions and auditable agent provenance` | (**status:** `accepted`)

## Problem Statement

Agentic editing introduces prompt injection, confused-deputy risks, and unclear
responsibility for vault mutations. The backend needs an actor, permission,
audit, and provenance model before agents can propose or apply document changes.

## Considerations

Agents should be treated as untrusted writers. ACP-style filesystem and terminal
capabilities are not appropriate for the core authoring workflow. The existing
local constraint is that the backend exposes a Vaultspec product contract, while
`vaultspec-core` remains the internal materialization and validation adapter.
Security policy must be enforced server-side, not trusted from LangGraph context.

## Constraints

The current deployment may be local-first, but the model must not assume a single
trusted user forever. Provenance can include sensitive prompts, source excerpts,
preimages, and tool outputs, so audit retention needs redaction and compaction
rules. Every wire response, including refusal, must keep the shared tiers
discipline.

## Implementation

The backend recognizes human, agent, system, and tool-executor actors. Agent
records include service identity, model/provider, run IDs, thread/checkpoint IDs,
delegated initiator, granted scopes, and capability negotiation. Permissions are
explicit: read context, propose, comment/respond, approve, apply, rebase,
rollback, rename, archive, and administer policy.

Agents may propose and request approval within delegated scope. They cannot
approve or apply their own side-effecting proposals — this ADR owns that ban.
The conditions under which trusted automation may auto-apply (a system actor
approving under a named, recorded, mode policy — never by pretending to be a
reviewer) are owned by the agentic-operation-modes ADR (2026-07-02) and are not
restated here. Raw filesystem writes and terminal execution are outside the
authoring permission set; agents request semantic proposal operations.

Audit events are append-only and record actor, effective actor, initiator,
action, target documents, base and result revisions, proposal and approval IDs,
LangGraph IDs, tool-call IDs, validation/core result summaries, idempotency key,
policy decision, tiers state, timestamp, and outcome. Provenance records source
document revisions and chunk fingerprints used to produce the proposal; raw
prompt and trace retention is policy-controlled.

## Rationale

The research identifies agents as practical confused deputies unless the backend
owns identity, authorization, approval, and audit. This decision separates "an
agent generated text" from "an authorized actor approved a vault mutation," while
preserving enough provenance to review and roll back decisions.

## Consequences

The initial implementation has more metadata and policy checks than a simple
agent-to-core bridge. In return, approvals, rollbacks, and incident review have
defensible evidence, and future multi-user deployment does not need to replace
the actor model.

## Codification candidates

- **Rule slug:** `agents-cannot-self-approve-vault-writes`.
  **Rule:** Agent-authored side-effecting vault changes require an authorized
  distinct reviewer or explicit recorded system auto-apply policy; the proposing
  agent cannot approve or apply its own proposal.
- **Rule slug:** `agent-provenance-is-audit-mandatory`.
  **Rule:** Every agentic authoring action must persist actor, initiator, target
  revisions, proposal IDs, approval IDs, run/tool IDs, policy outcome, and
  materialization result in an append-only audit trail.
