---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:a83b1e0bc85fc35e0bdfb946332bdf9bb33dc0417b58ae3899261e5b59da8fd3'
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
