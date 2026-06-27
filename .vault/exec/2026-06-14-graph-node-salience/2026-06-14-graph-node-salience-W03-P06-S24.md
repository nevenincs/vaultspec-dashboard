---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S24'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Parameterize the status lens: teleport biased to in-flight plans, betweenness-and-hub-led with high recency, the activity burst, and exec children aggregated into the parent

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Parameterized the status lens: teleport biased to in-flight plans (roadmap authority), betweenness-and-hub-led (betweenness-blend 0.7), high recency (0.25, 30d half-life) plus the 0.15 activity burst, exec children aggregated into the parent via the aggregated-exec feature.

## Notes
