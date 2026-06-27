---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S18'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Subtract the backbone focus-distance term to realize the DOI scalar I(n|L) = API(n|L) - gamma_L * D_backbone(n, focus)

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Implemented apply_focus_distance realizing the DOI scalar I(n|L) = API(n|L) - gamma_L * D_backbone(n, focus), with backbone_distance computing BFS-hop distance rank-normalized to [0,1]. Verified interest falls with distance and the focus keeps its full API.

## Notes
