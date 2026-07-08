---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

# `search-providers` `P01` summary

## Description

Phase P01 delivered the `GET /code-files` contract event — a cursor-paginated code-file listing serving the complete, unbounded code corpus off the LinkageGraph. The engine projection `build_code_file_rows` filters for `CodeArtifact` nodes (the files-only code representation), projects the minimal row shape `{path, node_id, title, lang}` with deterministic path ordering, memoizes per code generation on `CodeGraphCell`, and publishes the route at 500 rows-per-page default (2000 clamp) with honest `truncated` signaling from the ingest walk-cap stats. The contract is registered in `CONTRACT_ROUTES` and the bearer boundary with two-directional guard tests. Eight wire tests cover cursor walk to completion, page-boundary determinism, truncation honesty, and tier parity.

### Files Modified / Created

- Modified: `engine/crates/engine-query/src/graph.rs` (added `build_code_file_rows` projection)
- Modified: `engine/crates/vaultspec-api/src/app.rs` (added `code_file_rows` per-generation memo on `CodeGraphCell`)
- Modified: `engine/crates/vaultspec-api/src/routes/` (added `GET /code-files` route)
- Modified: `engine/crates/vaultspec-api/lib.rs` (contract registration)
