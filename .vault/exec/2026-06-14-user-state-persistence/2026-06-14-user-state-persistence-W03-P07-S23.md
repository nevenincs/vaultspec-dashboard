---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S23'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---




# add session and settings endpoint integration tests

## Scope

- `engine/tests/tests/conformance.rs`

## Description

- Added a `session_and_settings_surface_roundtrips_and_carries_tiers` integration test that boots real serve over the temp-vault fixture and drives the wire with the bearer header through the existing harness.
- Asserted `GET /session` and `GET /settings` carry the tiers block and serve the snake_case data shapes (`workspace`, `active_scope`, `scope_context.folder`, `scope_context.feature_tags`, `recents`; `global`, `scoped`).
- Asserted a true store roundtrip: `PUT /session` sets `scope_context` and `push_recent`, and a FRESH `GET /session` reads the persisted folder and feature tags back, not just the PUT echo.
- Asserted a settings roundtrip: a global key and a scoped key written via `PUT /settings`, both read back under a fresh `GET /settings` (global under `global`, scoped under `scoped[scope]`).
- Asserted `PUT /session` with an unknown `active_scope` returns 400 WITH the tiers block, names the unselectable worktree, and leaves the active scope unchanged.

## Outcome

The new test passes: `cargo test -p engine-e2e --test conformance session_and_settings` is green. Every assertion derives from the contract shape, not from copied output. The unknown-scope rejection is verified to be non-mutating.

## Notes

- The fixture has no `.vaultspec` dir, so the declared tier is truthfully unavailable in the tiers block; this is expected degradation, not a failure, and the tiers block is still present on every response.
