---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S47'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement document_ref resolution, provisional create targets, duplicate stem handling, missing target handling, and ref snapshot lookup

## Scope

- `engine/crates/vaultspec-api/src/authoring/documents.rs`

## Description

- Add the crate-private `authoring::documents` resolver module.
- Resolve existing documents by node id, stem, and canonical exact path into `DocumentRef::Existing` with real `blob:<hash>` revisions.
- Resolve provisional create refs with available, conflicting, and unknown collision status.
- Resolve rename targets with source refs preserved and proposed `doc:<stem>` identities.
- Read ref-scope document snapshots from committed tree/blob contents through the existing ingest reader.
- Keep listing discovery bounded while using exact stem scans for identity and collision correctness.

## Outcome

- Document references are stable, typed, and route-independent for later authoring phases.
- Missing documents, duplicate stems, unsupported ref kinds, invalid stems, and invalid paths fail loudly through `DocumentResolveError`.
- The resolver does not call `vaultspec-core` and does not materialize writes.

## Notes

- A direct `gix` dependency is declared for committed-tree catalog scans.
