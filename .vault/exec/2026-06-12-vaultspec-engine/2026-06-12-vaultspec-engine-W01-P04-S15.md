---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S15'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement document body reading from the working tree and from git blobs for ref-only scopes

## Scope

- `engine/crates/ingest-struct/src/reader.rs`

## Description

- Implement worktree body reading (filesystem) returning text plus a content hash as the provenance blob identity.
- Implement ref-scope body reading via the git object DB: ref to commit to tree to blob, returning the git blob id as identity; typed not-at-ref error.
- Test divergence: working-tree bytes vs committed blob bytes read differently with different identities.

## Outcome

Both scope flavors read documents without any write path; ref-only scopes get blob-true bodies (the same machinery later phases reuse for as-of reconstruction).

## Notes

None.
