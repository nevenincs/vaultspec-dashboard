---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S07'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

# Add the GET /settings/schema route serving the grouped, ordered, described registry through the shared envelope

## Scope

- `engine/crates/vaultspec-api/src/routes/session.rs`

## Description

- Added `GET /settings/schema` serving the grouped, ordered, fully-described registry through the shared `{data, tiers}` envelope, and mounted the route.

## Outcome

The engine serves the schema the client renders controls and synthesizes defaults from.

## Notes
