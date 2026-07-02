---
tags:
  - "#adr"
  - "#agentic-spec-authoring-backend"
date: '2026-06-29'
related:
  - "[[2026-06-29-agentic-spec-authoring-backend-research]]"
  - "[[2026-06-29-langgraph-approval-document-editing-research]]"
  - "[[2026-06-29-zed-acp-document-authoring-research]]"
  - "[[2026-06-16-document-editor-backend-adr]]"
  - "[[2026-06-18-document-edit-hardening-adr]]"
  - "[[2026-06-29-agentic-authoring-boundary-adr]]"
  - "[[2026-06-29-agentic-authoring-state-store-adr]]"
  - "[[2026-06-29-agentic-changeset-ledger-adr]]"
  - "[[2026-06-29-agentic-concurrency-leases-conflicts-adr]]"
  - "[[2026-06-29-agentic-approval-gates-review-state-adr]]"
  - "[[2026-06-29-agentic-langgraph-integration-adr]]"
  - "[[2026-06-29-agentic-streaming-events-outbox-adr]]"
  - "[[2026-06-29-agentic-apply-materialization-adr]]"
  - "[[2026-06-29-agentic-rollback-history-adr]]"
  - "[[2026-06-29-agentic-security-provenance-adr]]"
  - "[[2026-06-29-agentic-live-editing-room-adr]]"
  - "[[2026-06-29-agentic-authoring-api-contract-adr]]"
  - "[[2026-06-29-agentic-review-station-state-adr]]"
  - "[[2026-06-29-agentic-document-chunk-management-adr]]"
  - "[[2026-06-29-agentic-multiagent-composition-adr]]"
  - "[[2026-06-29-agentic-document-identity-adr]]"
supersedes:
  - '2026-06-29-agentic-document-chunk-management-adr'
modified: '2026-07-02'
---
# `agentic-change-format-and-chunking` adr: `hybrid proposal changes with section-scoped snapshots` | (**status:** `accepted`)

## Problem Statement

Agentic spec authoring needs reviewable changes that can be generated from
bounded document chunks, displayed as diffs, applied safely, and rolled back
later. The current editor write path supports direct body/frontmatter writes
with `blob_hash` concurrency, but agent work needs a proposal representation
that is stronger than raw text diffs and less brittle than arbitrary filesystem
writes.

## Considerations

Diffs are useful for review but unsafe as the sole apply or rollback authority.
Full snapshots and preimages are larger, but they give deterministic preview,
conflict detection, and rollback. Semantic operations align with the existing
Vaultspec contract: create, set body, set frontmatter, edit section, add related
link, rename, archive, and unarchive. Chunks are agent context and evidence, not
document identity.

The backend must serve the proposal, diff, validation, conflict, and
action-eligibility state. The frontend renders those projections through stores
and must not infer workflow state from raw chunks or diff text.

## Constraints

The accepted editor ADRs establish `vaultspec-core` as the `.vault/`
materialization owner, with the Rust backend brokering and validating the product
surface. This ADR relies on a new durable authoring store that is not cache or
session state. Markdown section selectors are not inherently stable: duplicate
headings, moved sections, and regenerated prose can invalidate offsets.
LangGraph and ACP shapes may inspire event payloads, but they must not become
the persisted change schema.

## Implementation

A proposal changeset stores child operations. Each operation carries target
document identity, base `blob_hash` or revision, operation kind, semantic target,
source chunk evidence, rollback material, materialized target snapshot,
normalized review diff, validation result, actor/run provenance, and idempotency
keys.

V1 stores enough rollback material and target materialization data for every
body-changing target to support deterministic preview, validation, conflict
detection, and rollback. The exact selector schema and storage cost are deferred
to the implementation schema. Section-scoped edits must carry exact-resolving
target evidence and selected preimage material; if the selector cannot be
resolved exactly against the expected base, the operation becomes conflicted
rather than applying a fuzzy patch.

Diffs are derived review artifacts. Apply uses the semantic operation and
validated materialized target through the backend's internal `vaultspec-core`
adapter. Rollback creates a new changeset from the stored preimage or inverse
semantic operation; it never erases the original event history.

**Chunk identity and bounded context (absorbed from the superseded
document-chunk-management ADR, 2026-07-02; DEFERRED as a served API).** When the
chunk surface is built, `document_chunk` identity is the tuple of document
reference, revision token, chunker version, byte or structural range, and content
hash; a chunk record carries content kind, structural path, bounded text,
neighbor references, and source hash; chunk listings are paginated and byte
capped; a new document revision invalidates current chunks while historical chunk
references retained as proposal provenance stay resolvable or degrade to
hash-only evidence with an explicit unavailability reason; chunk retention
follows document/proposal retention, never the bounded token-stream policy; and
agents read context through bounded chunk APIs, never arbitrary filesystem
reads. In V1, however, no chunk API ships (architecture review finding ASA-003):
agents read bounded context through the existing document content routes, and
`source chunk evidence` on a proposal operation is OPTIONAL provenance — an
operation without chunk evidence is valid. The chunk API becomes buildable, under
the contract above, when a retrieval consumer exists.

## Rationale

The research separates canonical, local, agent-run, and proposal buffers. This
decision makes the proposal buffer durable and reviewable without making token
chunks or diffs authoritative. It preserves the existing core-owned write
boundary while giving agents a semantic authoring target instead of raw
`fs/write_text_file` behavior.

## Consequences

The store will be larger because preimages and snapshots are retained. Rebase is
explicit when a section target drifts. In return, review, validation, rollback,
and conflict handling all have stable inputs, and future AST or CRDT editing
rooms can emit the same proposal shape.

## Codification candidates

- **Rule slug:** `proposal-diffs-are-review-artifacts`.
  **Rule:** Agentic document proposals must store base revision, preimage,
  materialized target snapshot, and semantic target metadata; human-readable
  diffs are never the sole apply or rollback authority.
- **Rule slug:** `section-edits-require-preimages`.
  **Rule:** Section-scoped agent edits must carry explicit target selectors and
  selected preimages, and unresolved selectors become conflicts rather than fuzzy
  writes.
