---
tags:
  - '#exec'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S05'
related:
  - "[[2026-06-14-graph-node-semantics-plan]]"
---




# parse the ADR H1 status line into a type-specific lifecycle state

## Scope

- `engine/crates/engine-graph/src/index.rs`

## Description


## Outcome

Added `adr_status` parsing the H1 status line into proposed/accepted/rejected/deprecated, dispatched by `doc_lifecycle` on doc_type=adr with checkbox fallback.

{OUTLINE}

## Notes

