---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S46'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Add a degraded-tier integration test asserting salience computed over available tiers is flagged partial in the tiers block end to end

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

## Outcome

Added the degraded-tier integration test (salience_routes.rs degraded_tier_flags_salience_partial_end_to_end): forcing the declared backbone tier degraded makes /graph/query report salience_partial=true for the SAME state the tiers block reports, with the ranking still served over available tiers (read from tiers, never guessed). Green.

## Notes
