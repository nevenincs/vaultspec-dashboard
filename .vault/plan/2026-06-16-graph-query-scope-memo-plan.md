---
tags:
  - '#plan'
  - '#graph-query-scope-memo'
date: '2026-06-16'
modified: '2026-07-12'
tier: L1
related:
  - '[[2026-06-16-backend-hotpath-hardening-research]]'
  - '[[2026-07-13-graph-query-scope-memo-adr]]'
---

# `graph-query-scope-memo` plan

- [x] `S01` - Compute scope_node_ids inside build_document_views (one pass) and return it; `thread it through graph_query_cached/inner so the Document branch reuses it instead of scanning all nodes per request; `engine/crates/engine-query/src/graph.rs`.
- [x] `S02` - Extend the DocViews cache tuple to carry the scope-node-id set and pass it at both graph_query_cached call sites; `engine/crates/vaultspec-api/src/app.rs`.
- [x] `S03` - Run the engine gate (fmt + clippy + tests, incl. the cached-vs-uncached parity test) to exit 0 and code-review; `engine/`.

## Description

## Steps

## Parallelization

## Verification
