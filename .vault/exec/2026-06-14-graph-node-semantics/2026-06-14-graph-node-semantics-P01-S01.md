---
tags:
  - '#exec'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S01'
related:
  - "[[2026-06-14-graph-node-semantics-plan]]"
---

# add an ontology module with an authority_class map from doc_type to register

## Scope

- `engine/crates/engine-query/src/ontology.rs`

## Description

## Outcome

Added `engine-query/src/ontology.rs` with `authority_class(doc_type)` mapping every type to its register (design/roadmap/evidence/judgment/law/substrate/manifest) and an honest `unknown` fallback; registered the module in the crate lib.

{OUTLINE}

## Notes
