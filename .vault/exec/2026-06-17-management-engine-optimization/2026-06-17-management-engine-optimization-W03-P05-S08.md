---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S08'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---




# Verify salience ranking invariants at scale

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

- Add a dense-core plus pendant-leaf salience fixture for k-core invariants.
- Assert that a 20-node clique keeps coreness 19 under heavy pendant fan-out.
- Assert that pendant leaves remain in the outer shell and do not inflate the connector.

## Outcome

The new test verifies a known graph-theory property without duplicating the production
peeling algorithm. It protects the optimization from regressions that would treat
fan-out volume as core salience.

## Notes

Verification: `cargo test -p engine-query coreness --lib`.
