---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S01'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Add a MAX_CONTENT_BYTES ceiling and a content reader resolving a doc:/code: node id to its repo-relative path

## Scope

- `engine/crates/vaultspec-api/src/routes/content.rs`

## Description

- Create the content route module with a `MAX_CONTENT_BYTES` ceiling of 1 MiB, mirroring the existing graph and file-tree bounding constants.
- Add `resolve_node_path`: a `code:` id carries the repo-relative path directly (stripping any `#symbol` qualifier, since content is per-file); a `doc:` id resolves its stem to a `.vault/**/<stem>.md` file by a bounded corpus walk matching the structural index's enumeration; other node kinds carry no content.
- Add `find_vault_doc`, walking the corpus with the same dot-dir / `data` / `logs` skipping the index applies, first-match-in-sorted-order to match the resolver's basename determinism.

## Outcome

The content reader resolves both content-bearing node-id forms to a repo-relative path with the byte ceiling in place. Unit tests cover code-symbol stripping, doc-stem resolution, unknown-stem not-found, and non-content node kinds.

## Notes

S01 through S04 are coterminous in one route file; this record covers the id-to-path resolution and the byte ceiling.
