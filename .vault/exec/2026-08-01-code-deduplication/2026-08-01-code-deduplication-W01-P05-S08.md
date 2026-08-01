---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:919fe8513a80e5ba8d7d1fe5230e254011843d41bcb48d28235aceeaef23483d'
step_id: 'S08'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
## Description

Established `ingest_struct::corpus` as the sole structural Vault corpus membership owner. Worktree enumeration returns sorted normalized `.vault/**/*.md` paths with hidden/data/log exclusions; resolved-tree enumeration returns the same membership shape with typed traversal errors. Live and historical graph indexing now call this owner directly; their parse and error policies remain local. The graph-local walks and stale references were deleted.

## Outcome

- VaultSpec RAG semantic discovery succeeded against the resident available and consistent index.
- A real temporary Git corpus regression passed, along with direct live-index and as-of graph tests.
- `cargo fmt --check` and `cargo check` passed for ingest-struct and engine-graph.
- Scoped diff checks passed; only known CRLF normalization warnings were emitted.
- Exact residue search found no deleted helper references.
- Independent Sol review approved after a two-comment cleanup.

## Notes

Evidence and scope limits are recorded above.
