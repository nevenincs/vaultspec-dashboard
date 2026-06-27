---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S14'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add a route test asserting the tiers block rides the lineage success envelope

## Scope

- `engine/crates/vaultspec-api/src/routes/temporal.rs`

## Description

- Add `graph_lineage_carries_the_tiers_block_on_the_success_envelope`: build a fixture worktree with two dated lane-owning documents, query `GET /graph/lineage?scope&from&to`, and assert 200, that `data.nodes`/`data.arcs` ride the payload, and that the `tiers` block is present with `semantic.available == false` (present-only) and `declared.available` a boolean (truthful per scope).

## Outcome

A route test proves the per-tier `tiers` block rides the lineage success envelope and that semantic is reported excluded while declared stays truthful.

## Notes

The test derives expectations from the contract (tiers on success, present-only semantic), not from observed output; it exercises the real handler end-to-end through the bearer-gated router via `get_with_token`.
