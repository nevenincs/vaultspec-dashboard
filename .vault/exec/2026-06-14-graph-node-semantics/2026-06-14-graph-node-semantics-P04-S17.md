---
tags:
  - '#exec'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:3489ef36e1beaf40192d2bdae3bc55453aa6dc47508e761f42fb6dc9f19b001e'
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
