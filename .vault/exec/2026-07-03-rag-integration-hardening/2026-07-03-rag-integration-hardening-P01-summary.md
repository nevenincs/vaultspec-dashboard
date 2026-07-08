---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# `rag-integration-hardening` `P01` summary

Replaced the per-query CLI subprocess with the bounded rag-client HTTP transport and rewrote the `/search` route to adopt the flat rag envelope shape, ensuring every fault path remains tiers-honest.

- Modified: `engine/crates/rag-client/src/search.rs`
- Modified: `engine/crates/vaultspec-api/src/routes/ops.rs`
- Created: `engine/crates/vaultspec-api/tests/search_routes.rs`

## Description

Phase P01 moves the search plane off the per-query cold CLI spawn onto the resident rag HTTP service, accessed through the bounded `rag-client` transport seam. The four steps rewrite the search module as a pure HTTP POST verb, swap the route over to that transport under `rag_offload`, point the annotator at rag's flat envelope (top-level `results`, forwarded `index_state`, `timing`, `summary`, `request_id`), and re-record the live fixture to match the new shape. The request-validation, availability gates, and tiers-honest degradation paths from the CLI era are preserved; `SEARCH_SIBLING_TIMEOUT` and the dead `forward_search` annotation are deleted per the ADR. All 52 rag-client tests and the full vaultspec-api suite (324 tests) pass with fmt and clippy clean.
