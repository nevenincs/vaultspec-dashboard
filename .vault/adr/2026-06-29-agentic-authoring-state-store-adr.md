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
  - '[[2026-06-29-agentic-changeset-ledger-adr]]'
  - '[[2026-06-29-agentic-change-format-and-chunking-adr]]'
  - '[[2026-06-29-agentic-concurrency-leases-conflicts-adr]]'
  - '[[2026-06-29-agentic-approval-gates-review-state-adr]]'
  - '[[2026-06-29-agentic-langgraph-integration-adr]]'
  - '[[2026-06-29-agentic-streaming-events-outbox-adr]]'
  - '[[2026-06-29-agentic-apply-materialization-adr]]'
  - '[[2026-06-29-agentic-rollback-history-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
  - '[[2026-06-29-agentic-live-editing-room-adr]]'
  - '[[2026-06-29-agentic-authoring-api-contract-adr]]'
  - '[[2026-06-29-agentic-review-station-state-adr]]'
  - '[[2026-06-29-agentic-document-chunk-management-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-06-29-agentic-document-identity-adr]]'
---

# `agentic-authoring-state-store` adr: `durable authoring state store` | (**status:** `accepted`)

## Problem Statement

Pending approvals, proposal snapshots, rollback preimages, actor provenance, and
authoring session history are product data. They cannot live in LangGraph
checkpoints, re-derivable engine cache, or best-effort dashboard session state.
Losing them would be authoring data loss.

## Considerations

LangGraph should persist runnable agent state, interrupts, and checkpoints, but
Vaultspec must own the durable review and document-change record. The current
engine store is re-derivable; authoring state is not. The store must support
concurrent agents, resumable UI recovery, approval audit, rollback, schema
evolution, bounded queries, and retention controls for large generated artifacts.

## Constraints

The store must fail loud on schema/version mismatch, not heal by dropping
proposals. It must use migrations, concurrency discipline, bounded query
surfaces, and export/backup expectations. It must not become a vault document
format or bypass core materialization. Token streams and tool traces can be
compacted; non-terminal approvals and rollback preimages cannot be treated as
disposable cache.

## Implementation

Add a dedicated authoring store behind the fenced authoring backend domain. This
ADR decides the store invariants, not the physical database engine: it must be
durable, migrated, bounded, backed up, concurrency-safe, and not re-derivable
cache. A local dashboard deployment may choose SQLite with WAL and a later
server deployment may choose another database, but that storage binding is a
schema/implementation decision after the authoring service boundary is settled.

The store records authoring sessions, prompt turns, proposal records, approval
decisions, changeset events, per-target preimages, validation results, actor
provenance, LangGraph references, idempotency records, and durable event
publication records.

The store separates durable lifecycle events from ephemeral generation data.
Lifecycle state is retained and replayable. Token chunks, debug traces, and
intermediate model messages are bounded, summarized, or compacted by policy.

Retention is conservative by default: non-terminal proposals, approvals, apply
results, and preimages for applied changes are kept. Explicit compaction may
summarize rejected or superseded work and large transcripts, but deleting
rollback preimages requires recording that preimage rollback is no longer
available while preserving audit hashes and receipts.

## Rationale

A dedicated store matches the research finding that pending approvals are
product state. Deferring the physical database choice avoids over-specifying
storage before the authoring service boundary and schema are settled. Keeping
LangGraph execution state separate prevents checkpoint retention, replay, or
cancellation behavior from rewriting Vaultspec's authoring history.

## Consequences

The system gains durable recovery for approvals, proposals, and rollback. It
also accepts migration, compaction, backup, and privacy obligations. The main
risk is unbounded growth from prompts and snapshots, so retention classes and
caps must be part of the store contract from V1.

## Codification candidates

- **Rule slug:** `authoring-state-is-product-data`.
  **Rule:** Proposals, approvals, apply records, rollback preimages, and
  authoring audit events live in the durable authoring store and are never stored
  only in LangGraph checkpoints, frontend session state, or re-derivable engine
  cache.
- **Rule slug:** `authoring-retention-is-explicit`.
  **Rule:** Authoring compaction may summarize bounded generation artifacts, but
  it must not silently delete pending approvals or applied-change rollback
  preimages without recording the resulting rollback limitation.
