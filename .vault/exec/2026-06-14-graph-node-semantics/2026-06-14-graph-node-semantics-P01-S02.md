---
tags:
  - '#exec'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:bbb92b377618d388b554c092b030f5a0dbdab1c75c75179d034fc52199c90c60'
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
