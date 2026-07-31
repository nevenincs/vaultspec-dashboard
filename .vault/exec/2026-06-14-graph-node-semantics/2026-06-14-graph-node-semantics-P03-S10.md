---
tags:
  - '#exec'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:35ccf0f769597f236fc78804bcbbf3e20a06233ef9bffb9a877e447a237a2fda'
step_id: 'S10'
related:
  - "[[2026-06-14-graph-node-semantics-plan]]"
---

# add the aggregate collapsibility hint for exec records bound to a parent plan

## Scope

- `engine/crates/engine-query/src/ontology.rs`

## Description

## Outcome

Added `is_aggregate_species` flagging only exec records as the collapsible aggregate species.

{OUTLINE}

## Notes
