---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S13'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Implement the discrete per-lens lifecycle multiplier reading the semantics lifecycle vocabulary, kept distinct from recency so recent-but-archived and old-but-in-flight resolve correctly

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Implemented the discrete per-lens lifecycle_multiplier over LifecyclePhase (in-flight/durable/archived), kept distinct from recency: status boosts in-flight and heavily damps archived; design keeps an archived ADR damped-but-nonzero. Recent-but-archived and old-but-in-flight resolve correctly.

## Notes
