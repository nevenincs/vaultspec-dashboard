---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S29'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Add the lens request parameter to the graph query body and parse it, defaulting to the status lens when omitted

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

## Outcome

Added the lens (and focus) request parameter to GraphQueryBody and parse_lens, defaulting to the status lens when omitted; an unrecognized lens is a tiered 400, not a silent default. Verified by the route test (omitted lens defaults to status; bogus lens is a 400 carrying the tiers block).

## Notes
