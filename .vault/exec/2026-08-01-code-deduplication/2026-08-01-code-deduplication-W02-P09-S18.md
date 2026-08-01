---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:ce3dbabc85b35826fe3b252e73abaeac8cf747e4ee324e6eb0d11fb58632a4ca'
step_id: 'S18'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
## Description

Migrated authoring document listing to direct canonical corpus inventory use. Worktree listing uses the strict corpus entrypoint and ref listing uses resolved-tree inventory. Authoring keeps its cap after membership, totals and truncation, candidate projection, sorting, shared pagination, and typed error mapping. The strict worktree entrypoint shares the corpus module's only traversal; stem scans remain for S19.

## Outcome

- VaultSpec RAG semantic discovery succeeded against the resident available and consistent index.
- Real temporary Git worktree/ref auxiliary-exclusion listing regression passed, along with hard-cap truncation and ref-snapshot coverage.
- `cargo fmt --check` and `cargo check` passed for ingest-struct and vaultspec-api.
- Scoped diff check passed.
- Independent Sol review approved.

## Notes

Evidence and scope limits are recorded above.
