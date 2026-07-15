---
tags:
  - '#adr'
  - '#agentic-feedback-loop'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-agentic-feedback-loop-research]]"
  - "[[2026-07-14-agentic-document-offering-research]]"
  - "[[2026-07-14-agentic-document-offering-reference]]"
  - "[[2026-07-12-authoring-surface-adr]]"
  - "[[2026-07-11-section-scoped-operations-adr]]"
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
  - "[[2026-06-29-agentic-approval-gates-review-state-adr]]"
  - "[[2026-06-29-agentic-review-station-state-adr]]"
---

# `agentic-feedback-loop` adr: `batched anchored comments as agent revision context` | (**status:** `proposed`)

## Problem Statement

The shipped comment model is anchored to headings and is not an input to agent runs. That is sufficient for section-level human discussion, but it cannot preserve the selected text, source revision, or generated artifact that made a comment meaningful. The current authoring continuation contract accepts only a prompt and summary, so an agent cannot reliably consume a bounded set of feedback.

Agentic document-writing products use document comments as the familiar iteration surface. Approval cards and the Review Station solve a different problem: governance over applying or rolling back proposed changes. Requiring those controls for every writing iteration would make governance UI the authoring happy path and would obscure the document-centered mental model.

This ADR makes accumulated, anchored comments the primary structured input for revising an agent-generated document while preserving the existing ledger, policy gates, and Review Station. It amends the heading-only comment decision in the authoring-surface ADR and the continuation boundary in the A2A orchestration-edge ADR. It builds on the exact selector semantics established for section-scoped operations. It does not supersede the approval-gate, Review Station, operation-mode, authoring-surface, or A2A decisions.

## Considerations

- Line numbers are useful display affordances but unstable identifiers after an edit. Durable anchors need document identity, section identity, selected preimage, and a source revision.
- The existing comment table, event stream, retention behavior, and resolution workflow are stable foundations worth extending rather than replacing.
- Section-scoped operations already establish exact-or-orphaned selection behavior; comments should use the same principle instead of silently attaching to similar text.
- A user commonly leaves several comments before asking for a revision. One run per comment would fragment context, multiply proposals, and create ordering races.
- Consumption by an agent is not resolution by a human. The system must retain authorship and discussion history even after a revision addresses a comment.
- Some generated changes will still require approval under policy. Document iteration must therefore feed, not bypass, the existing proposal and governance model.
- The reference document identifies the current seams: comments target canonical document nodes, selection hints are advisory, prompt turns lack a feedback-batch reference, and no document composer exists in the frontend.

## Considered options

- **Free-form follow-up chat only:** simple, but discards document anchors, comment authorship, and an auditable relationship between feedback and revision. Rejected.
- **Start an agent run for every comment:** responsive, but produces fragmented context, excessive revisions, and ordering races. Rejected.
- **Represent comments as approval or review cards:** reuses governance UI, but conflates editorial intent with permission to apply a change. Rejected.
- **Create an immutable batch from explicitly submitted comments:** preserves familiar document comments, gives the agent bounded deterministic context, and retains the governance boundary. Chosen.

## Constraints

- A line number alone must never be the persisted identity of a comment anchor.
- Anchor recovery is exact-or-orphaned. The system must not use fuzzy matching to move a comment onto merely similar content.
- Feedback batches are immutable, idempotent, revision-fenced, and resource-bounded by comment count, body size, anchor preimage size, aggregate payload, and retained history.
- Comments created or edited after batch dispatch are excluded from that batch and may be submitted in a later batch.
- An agent may consume a comment as context but may not resolve, delete, rewrite, or impersonate the human comment.
- The backend owns feedback-batch assembly and validation. A client or remote agent must not supply an authoritative reconstructed context blob.
- Existing authoring sessions, proposal ledgers, policy gates, and Review Station are stable parent features. This decision extends their inputs and presentation roles without changing their authority.

## Implementation

### D1. Use a versioned anchor union

A comment anchor is one of document, section, or selection. A selection anchor contains the document and section identity, the source document or proposal revision, a bounded exact preimage or digest, and an advisory range relative to the section. Display line hints may be retained for orientation but are not authoritative. Existing heading anchors migrate to section anchors without inventing selection precision.

### D2. Attach pending comments to the next ordinary agent turn

Users leave and discuss comments in the document, then continue through the standard chat composer. Pending comments appear through the composer's normal attached-context treatment, for example **4 comments**. Submitting the next message snapshots that attached set into an immutable feedback batch. There is no separate review card, custom revision action, or parallel feedback workflow. Natural-language continuations include **Address the comments** and **Revise the ADR using these comments**.

### D3. Snapshot an immutable feedback batch

The backend snapshots an ordered set of comment identifiers and bodies, their anchors, author identity, source document or proposal revision, session identity, optional general instruction, and creation time. The batch receives a stable identifier and digest. Subsequent comment edits do not mutate it.

### D4. Continue authoring by batch reference

The future authoring continuation request carries a `feedback_batch_id`. The engine verifies ownership, revision fences, limits, and idempotency. The current A2A `POST /api/threads` request cannot carry this reference, and the accepted five-verb gateway is not implemented, so this is an explicit cross-repository contract addition. The A2A edge transports only identifiers and retrieves authoritative feedback context through the engine API; it does not become the owner of comment state.

### D5. Return a normal document revision

The agent consumes the referenced feedback batch and returns a new ledgered document revision through the existing authoring workflow. The revision records the batch it consumed. The agent cannot resolve, delete, rewrite, or impersonate human comments, and this decision adds no new per-comment agent disposition state.

### D6. Separate iteration from governance

The generated document, its anchored comments, and the prompt composer are the primary authoring iteration surface. The Review Station remains authoritative for approvals, application, rollback, conflicts, and audit when policy or risk requires those controls.

### D7. Keep state transitions semantically distinct

Submitting feedback is not approval. Resolving a comment is not applying a proposal. Applying a proposal is not resolving its source comments. A new generated revision invalidates or stales prior approvals according to existing revision and policy rules.

## Rationale

The research shows a consistent document-centered interaction: the agent generates an artifact, people comment in the artifact's context, and the agent revises it. The implementation reference shows that VaultSpec already has most durable primitives—comments, authoring sessions, proposals, events, and governance—but lacks the bridge between comments and a prompt continuation.

An immutable feedback batch is that bridge. It gives the agent a reproducible context boundary, makes retries idempotent, preserves human authorship, and lets the UI remain familiar. It also respects the A2A boundary: remote execution can act on references without duplicating engine-owned state or authorization.

## Consequences

- Users can revise an ADR through ordinary anchored comments instead of translating every note into a new prompt or approval card.
- Agent runs become auditable: each revision identifies the exact immutable feedback batch it consumed.
- Review Station remains available without dominating the writing workflow.
- The comment schema, target model, continuation request, events, resource limits, and UI all require coordinated additive changes.
- The current A2A create-thread contract cannot consume feedback batches; comment-driven revision remains unavailable until the engine gateway and A2A continuation contract implement the reference.
- Exact anchoring will deliberately orphan comments when their preimage no longer matches. The UI must make orphaning visible and support human re-anchoring.
- This decision enables later multi-author feedback, targeted re-research, and selective agent revision without changing the core governance model.
