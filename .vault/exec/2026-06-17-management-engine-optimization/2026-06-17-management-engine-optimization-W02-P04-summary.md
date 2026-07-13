---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-07-12'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---

# `management-engine-optimization` `W02.P04` summary

Document query projection caching now includes generation-keyed candidate indexes and
serve state wiring.

- Modified: `engine/crates/engine-query/src/graph.rs`
- Modified: `engine/crates/vaultspec-api/src/app.rs`
- Modified: `engine/crates/vaultspec-api/src/routes/query.rs`
- Created: `engine/crates/engine-query/tests/query_hotpaths.rs`

## Description

S05 introduced `DocumentViews` with sorted candidate indexes for common node and edge
facets. S06 stores that indexed view per scope generation and routes present document
queries plus embedding node-set selection through it. Verification passed with
cached/uncached equality tests, the production query hotpath fixture, the full
`engine-query` lib suite, and `cargo test -p vaultspec-api`.
