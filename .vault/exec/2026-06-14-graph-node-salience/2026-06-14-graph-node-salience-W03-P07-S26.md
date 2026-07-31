---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:402564f51b6c97f86835c0ca13931559b2ba7ae64323e9e1cc711fe871750f6a'
step_id: 'S26'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Implement focus folding: mix focus-bias into the lens teleport vector and re-run the warm-started PPR so a-priori minus distance is one computation

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Implemented focus folding via compute_salience: with a focus node the backbone-distance term is subtracted from the a-priori importance (apply_focus_distance) over the already-computed warm basis, so a-priori-minus-distance is one computation. Verified focus folding shifts the DOI ranking.

## Notes
