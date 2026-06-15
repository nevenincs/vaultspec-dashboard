---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S12'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---




# Implement exponential recency decay exp(-ln2 * age / half_life) reading node modified dates, with the half-life a per-lens parameter

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description


## Outcome

Implemented exponential recency decay exp(-ln2 * age / half_life) reading the node modified date, with the half-life a per-lens parameter (design 365d durable, status 30d fresh). A node with no modified date returns the neutral 0.5 midpoint. Verified the half-life halving behavior.

## Notes

