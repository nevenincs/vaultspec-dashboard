---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S21'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---




# Add a sweep test asserting top-k ordering stays stable under bounded perturbation for both launch lenses, failing if a lens top-k flips

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description


## Outcome

Sweep test asserting top-k overlap stays above the stability floor under +/-30% weight perturbation for BOTH launch lenses, failing if a lens top-k flips. Both lenses pass; this is the artifact that turns the lens-derived weights from magic numbers into tested ones.

## Notes

