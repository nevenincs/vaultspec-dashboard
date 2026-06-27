---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S22'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# register the session route prefixes in the SPA gate

## Scope

- `engine/crates/vaultspec-api/src/routes/spa.rs`

## Description

- Added `/session` and `/settings` to `API_PREFIXES` in `spa.rs`.
- That one list is both the bearer boundary (so the new routes are token-gated) and the SPA-fallback exclusion (so an unknown path under these prefixes returns a JSON 404 carrying the tiers block instead of being swallowed by the `index.html` fallback).

## Outcome

The session and settings routes are now bearer-gated and excluded from the SPA fallback. `cargo build -p vaultspec-api` is clean.

## Notes

- `API_PREFIXES` is shared by both `bearer_gate` (in `app.rs`) and `spa_fallback`, so this single edit gates the routes and protects them from the fallback at once.
