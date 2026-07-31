---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:14fdbb2f9f22abddd5bd19a70993a7788bec4a44cc5bfbf4138366165c8b61ba'
step_id: 'S20'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Implement the weight-sensitivity sweep computing top-k Kendall-tau stability under +/- weight perturbation per lens

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Implemented the weight-sensitivity sweep: kendall_tau rank correlation plus weight_sensitivity_sweep, which perturbs each weight by +/-perturb, recomposes the API (reusing normalized criteria), and measures worst-case top-k Kendall-tau and overlap vs baseline. SweepResult exposes the STABILITY_FLOOR.

## Notes
