---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:f75e681ff0aa7747d36723c7c1f4cc9a3e6e3248f004d5f5391310d64b1a18b3'
step_id: 'S25'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Unit-test that both lenses derive from one model and yield distinct orderings on the same graph (authority-led vs pivotal-bridge-led)

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Unit test proving both lenses derive from one model (same LensBasis) yet yield distinct top-k orderings on the same graph: design surfaces an authority ADR, status surfaces a plan. Authority-led vs pivotal-bridge-led.

## Notes
