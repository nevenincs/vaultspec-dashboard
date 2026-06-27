---
tags:
  - '#exec'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S02'
related:
  - "[[2026-06-14-graph-node-semantics-plan]]"
---

# unit-test authority_class across every doc type plus the unknown fallback

## Scope

- `engine/crates/engine-query/src/ontology.rs`

## Description

## Outcome

Unit-tested `authority_class` across all eight doc types plus None and an unrecognized type, asserting the unknown fallback is never a coercion.

{OUTLINE}

## Notes
