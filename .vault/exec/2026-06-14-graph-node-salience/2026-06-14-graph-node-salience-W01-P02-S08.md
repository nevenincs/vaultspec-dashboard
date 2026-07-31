---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:d22253182657a813d2c6ba6df33e90a6046127e8d529be084ae9932c44314442'
step_id: 'S08'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Implement linear-time k-core peeling returning per-node coreness over the backbone

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Implemented linear-time k-core peeling (min-degree peel, running max level) returning per-node coreness. Fan-out robust: pendant exec leaves peel first and cannot inflate a plan coreness. Verified the exec leaf gets minimal coreness.

Implemented linear-time k-core peeling (min-degree peel, running max level) returning per-node coreness. Fan-out robust: pendant exec leaves peel first and cannot inflate a plan coreness. Verified the exec leaf gets minimal coreness.

## Notes
