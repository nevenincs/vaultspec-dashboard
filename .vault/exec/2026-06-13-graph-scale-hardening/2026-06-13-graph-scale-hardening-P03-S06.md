---
tags:
  - '#exec'
  - '#graph-scale-hardening'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S06'
related:
  - "[[2026-06-13-graph-scale-hardening-plan]]"
---

# Default to LOD, finish cursor pagination, and enforce a hard node ceiling on document granularity

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Added `MAX_DOCUMENT_NODES` (5000) and `bound_document_slice`: the
  document-granularity `/graph/query` response is capped at the ceiling, keeping
  only edges among kept nodes so the returned subgraph stays self-consistent,
  and carries a `truncated: {total_nodes, returned_nodes, reason}` block (null
  when not truncated).
- Applied the bound to both the live and `as_of` document paths; feature
  granularity is untouched (already bounded by feature count).
- Unit-tested the ceiling (under-ceiling untouched; over-ceiling truncates to
  the ceiling and reports the original total).

## Outcome

The wire can no longer carry the unbounded multi-gigabyte document body the scale
bench projected (~2.25 GB at 1M nodes). The constellation (feature) granularity
remains the unbounded-safe default view. clippy `-D warnings` and the new unit
tests are green.

## Notes

DEVIATION: the step title also names "default to LOD" and "finish cursor
pagination". The LOD default is landed on the FRONTEND (P04.S09) — that is where
the default-granularity choice lives (the engine honors whatever granularity is
requested and must not silently change a client's explicit request). Full cursor
pagination of the document node list was set aside in favor of the hard ceiling +
feature-scoped descent (S07): paginating a node list without its edges produces
inconsistent partial graphs, whereas the ceiling + feature filter gives a
bounded, self-consistent subgraph. The `paginate` helper remains wired on the
list endpoints. query.rs is under concurrent edit by a parallel agent; committed
by pathspec immediately after clippy.
