---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-07-12'
body_hash: 'sha256:83712bff725b96b09fa642f3b3c27736f7ef3aa275cd9634d4dcbd0e520ba21d'
step_id: 'S06'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

# Wire typed validation into PUT /settings returning typed errors through the shared envelope helper

## Scope

- `engine/crates/vaultspec-api/src/routes/session.rs`

## Description

- Wired validation into `PUT /settings`: a rejected write returns a typed 400 through a new shared `api_error_kind` helper carrying the `error_kind` and the tiers block.
- The canonical (normalized) value is what persists.

## Outcome

Typed rejections ride the shared envelope; no hand-built tiers-less error bodies.

## Notes
