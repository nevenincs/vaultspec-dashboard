---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S49'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the landscape and graph query endpoints: map, vault-tree, graph query, filters, node detail, neighbors, evidence and discover

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Implement the landscape and graph query endpoints: map, vault-tree, POST graph/query (validated filter echoed; document and feature granularity), filters vocabulary, node detail/neighbors/evidence, POST discover (rag candidates; degrades to the tier block when rag is absent, never an error).
- Scope is stateless and validated per request; v1 serves the launch worktree only and 400s other scopes honestly (recorded bound).

## Outcome

Contract sections 3-4 served from the live graph. Audit carry W02P05-203 CLOSED: constellation meta-edges are memoized per graph generation - one aggregation per rebuild, not per request (pointer-equality tested).

## Notes

Single-scope serving is a v1 bound, not a contract deviation: scope remains a required validated parameter; multi-view composition stays open.
