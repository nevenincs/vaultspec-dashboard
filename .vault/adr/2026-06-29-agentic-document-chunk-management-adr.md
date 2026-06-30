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
  - '[[2026-06-29-agentic-authoring-api-contract-adr]]'
  - '[[2026-06-29-agentic-review-station-state-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-06-29-agentic-document-identity-adr]]'
---

# `agentic-document-chunk-management` adr: `revision scoped document chunk management` | (**status:** `accepted`)

## Problem Statement

Agents need bounded document context, section evidence, and source citations for
proposals. The existing change-format ADR records source chunk evidence, but the
backend also needs a chunk-management decision so chunks are stable, revision
scoped, invalidated correctly, and not confused with transient token streams.

## Considerations

Document chunks are read-context and provenance artifacts. They are not
authoritative document identity and they are not proposal state by themselves.
They must be stable enough to let a reviewer understand what an agent saw, but
bounded enough for safe retrieval and storage. Chunk algorithms will evolve, so
chunk identity must include algorithm versioning.

## Constraints

Chunk listings must be bounded by default. Chunks must be keyed to a document
revision or `blob_hash`; applying a new document revision invalidates previous
current chunks without deleting historical chunk references used for provenance.
The store must distinguish persisted document chunk evidence from raw model token
chunks, debug traces, and ephemeral stream frames. Agents cannot request
arbitrary file reads as a substitute for chunk APIs.

## Implementation

Define `document_chunk` identity as a tuple of document reference, revision
token, chunker version, byte or structural range, and content hash. A chunk record
carries language/content kind, heading or structural path when available, bounded
text, neighboring chunk references, and source hash. Chunk lists are paginated and
cap the maximum bytes returned per request.

The authoring API exposes bounded chunk lookup by document/revision, chunk id,
structural selector, and search result reference. Agents attach chunk ids and
chunk hashes to proposal operations as evidence. When a document revision
changes, current chunk projections are rebuilt or marked stale; historical chunk
ids referenced by proposals remain resolvable or degrade to hash-only evidence
with a clear unavailability reason.

Chunk retention is separate from token retention. Document chunks and proposal
evidence follow document/proposal retention policy. Raw generation tokens and
debug traces follow the bounded generation-stream policy.

## Rationale

Revision-scoped chunk identity gives agents useful context without turning chunk
offsets into document truth. It also makes provenance reviewable: the backend can
show exactly which bounded document slices an agent used, and can detect when
those slices are stale against the current document.

## Consequences

The backend needs a chunker version contract and bounded retrieval surfaces.
Changing the chunking algorithm becomes an indexed-data migration or rebuild
decision. The benefit is safer agent context, clearer provenance, and less
pressure to expose arbitrary filesystem reads.

## Codification candidates

- **Rule slug:** `document-chunks-are-revision-scoped`.
  **Rule:** Agent-readable document chunks are identified by document reference,
  revision token, chunker version, range, and content hash; they are invalidated
  or marked stale when the source document revision changes.
- **Rule slug:** `chunk-apis-are-bounded-context-surfaces`.
  **Rule:** Agents read document context through bounded chunk APIs and proposal
  evidence references, never through arbitrary filesystem reads.
