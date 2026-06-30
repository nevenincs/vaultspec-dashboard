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
  - '[[2026-06-29-agentic-document-chunk-management-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
---

# `agentic-document-identity` adr: `document identity and provisional targets` | (**status:** `accepted`)

## Problem Statement

Changesets, chunks, approvals, rollbacks, and agent work units all need stable
target references. The current dashboard uses `doc:<stem>` node ids and rename
changes that id. Agentic authoring also needs targets for documents that do not
exist yet and must survive title changes, renames, archive operations, and
materialization results.

## Considerations

The accepted editor ADR treats rename as a contract event that re-keys observers
from old `doc:<stem>` to new `doc:<stem>`. The authoring backend should not
pretend current node ids are permanent across rename, but it also cannot leave
proposals pointing at ambiguous titles or paths. Create proposals need
provisional targets before core returns the final document id.

## Constraints

Target identity must include a revision token for existing documents. It must
not rely on a human-readable title. It must distinguish existing documents,
provisional create targets, and post-materialization results. It must preserve
old and new identities for rename/archive/link repair audit. Frontend selection
and review projections must consume backend-resolved target refs rather than
derive ids locally.

## Implementation

V1 uses a `document_ref` envelope instead of a bare path or title. For existing
documents it carries scope/worktree identity, current `doc:<stem>` node id, stem,
path or path handle, document type, and base revision token such as `blob_hash`.
For create operations it carries a `provisional_doc_id`, desired document type,
feature, title, proposed stem if known, and collision status. For rename it
carries source `document_ref`, proposed target stem/id, and result ref after
materialization.

Changeset child operations store both the reviewed target ref and the
post-apply result ref. Projections resolve the current visible id, title, path,
archived state, and stale/renamed status for frontend display. Rollback uses the
stored source and result refs to decide whether an inverse operation is still
safe or whether a manual repair proposal is required.

## Rationale

A structured target ref keeps proposals stable without inventing a permanent
document identity system before the vault model supports one. It matches the
existing rename ADR by treating rename as a re-keying event while preserving
enough audit data to understand what was reviewed and what was applied.

## Consequences

Every authoring operation carries more identity metadata. The benefit is that
creates, renames, archives, and rollbacks can be reviewed and audited without
guessing from a title or path. If the project later introduces permanent document
UUIDs, `document_ref` can carry them without changing the public authoring
contract.

## Codification candidates

- **Rule slug:** `authoring-targets-use-document-refs`.
  **Rule:** Agentic authoring targets use backend-resolved `document_ref`
  envelopes with revision tokens, provisional create ids, and post-apply result
  refs; they never rely on title or path alone.
- **Rule slug:** `rename-preserves-source-and-result-refs`.
  **Rule:** Authoring rename operations record both the reviewed source target
  and the materialized result target so review, re-keying, rollback, and audit
  remain unambiguous.
