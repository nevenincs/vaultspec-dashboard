---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S14'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Implement the status-lens activity-burst term over recent temporal-tier edge activity (new exec records and commit-correlation edges in the recent window)

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Implemented the status-lens activity_burst over recent temporal-tier edges (new exec/commit-correlation edges in a 7-day window), soft-saturated to [0,1) so a hot node reads hot without swamping the field. Verified a recent temporal edge bursts and an edgeless node does not.

## Notes
