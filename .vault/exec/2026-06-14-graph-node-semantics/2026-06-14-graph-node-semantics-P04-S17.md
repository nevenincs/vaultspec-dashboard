---
tags:
  - '#exec'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S17'
related:
  - "[[2026-06-14-graph-node-semantics-plan]]"
---




# prove the derivation label is not part of the edge stable key

## Scope

- `engine/crates/engine-query/src/ontology.rs`

## Description


## Outcome

Proved the derivation label is not part of the edge stable key: `edge_id` takes no derivation input, so re-derivation is identical regardless of label.

{OUTLINE}

## Notes

