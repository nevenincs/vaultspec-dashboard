---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S36'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement node detail with interior structure, neighbors with depth and tier filters, and evidence queries

## Scope

- `engine/crates/engine-query/src/node.rs`

## Description

- Implement node detail wrapping the P05 context bundle (interior structure carrier in v1; plan wave/phase/step interiors arrive when plan-container nodes are minted from plan parsing).
- Implement lazy ego neighbors with depth and tier filters via breadth-first expansion, deduped edges, deterministic ordering, truthful None for unknown ids.
- Implement evidence: attached documents, code locations with live resolution state, correlated commits each naming its D3.4 rule.

## Outcome

The contract section 4 node family served from the in-memory graph.

## Notes

Records the W02P06-301 decision as the review required: mention-target identity derives from mention text alone (step ids keyed canonically, symbols by the unqualified hash-symbol form); resolution transitions mutate state, never identity - so the ids this phase exposes are stable under healing.
