---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S20'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---




# add GET and PUT settings endpoints carrying the tiers block

## Scope

- `engine/crates/vaultspec-api/src/routes/session.rs`

## Description

- Added `get_settings` and `put_settings` handlers to the `session.rs` route module.
- `GET /settings` returns the shared `{data, tiers}` envelope where `data` is `global` (a flat `{ key: value }` map) and `scoped` (`{ scope: { key: value } }`) over every warm scope that has scoped keys.
- Built the settings block from `list_settings` (global plus per warm scope) inside ONE scoped guard, dropped before the envelope is built.
- Added a recency-free `scope_tokens` accessor on `ScopeRegistry` so `/settings` enumerates the resident scopes' scoped keys without touching LRU state.
- `PUT /settings` accepts `{ scope?, key, value }`: an absent `scope` writes a global key, a present `scope` writes a scope-scoped key; PUT returns the same shape GET serves.
- Kept the guard-drop-before-await discipline on every settings read and write.

## Outcome

The settings GET and PUT endpoints exist and carry the tiers block through the shared `envelope` helper. `cargo build -p vaultspec-api` is clean. The settings wire shape (`global`, `scoped`) is defined in clean snake_case for W04 to mirror.

## Notes

- `scoped` omits a scope that has no scoped settings rather than carrying an empty object, so the map stays sparse.
- The global sentinel scope is named locally (`GLOBAL_SCOPE_KEY`) so the API never threads the empty-string sentinel by hand.
