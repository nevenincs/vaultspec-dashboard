---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S33'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Flag salience partial via the tiers block when a tier is degraded, computing over available tiers and never presenting a guessed-complete score

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Flag salience partial via is_partial read from the tiers block (degradation-is-read-from-tiers): a degraded backbone tier (declared/structural) flags any lens partial; a degraded temporal tier flags the status lens partial. The route surfaces salience_partial in the response, computing over available tiers and never presenting a guessed-complete score.

## Notes
