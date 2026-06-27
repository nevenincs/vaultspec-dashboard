---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S32'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Add the lens parameter to the asof, diff, and neighbors routes, serving salience through the same shared envelope helper with the tiers block

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

## Outcome

Added the lens parameter to the asof, diff, and neighbors routes, all served through the shared envelope helper with the tiers block. Asof attaches salience over the historical graph basis (flagged partial); neighbors folds the ego center as the DOI focus and attaches salience to the ego nodes; diff accepts+echoes lens for wire uniformity.

## Notes
