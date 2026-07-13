---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-06-13-vaultspec-engine-plan]]"
---

# Add the git block to serve status and dates plus doc-type to vault-tree entries, matching the CLI front door

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Add a `git` block (`head_ref`, `dirty`) to serve `/status`, resolved from the
  served worktree - front-door parity with the CLI status verb (D6.1).
- Add `title`, `doc_type`, and `dates` to `/vault-tree` entries so the client
  never derives doc_type from stem suffixes.

## Outcome

Conformance divergence 4 is green: serve `/status` carries the git block
(head_ref + dirty) and `/vault-tree` entries carry doc_type and dates
server-side.

## Notes

The git block degrades to null when the served path cannot be matched to an
enumerated worktree, rather than failing the status call.
