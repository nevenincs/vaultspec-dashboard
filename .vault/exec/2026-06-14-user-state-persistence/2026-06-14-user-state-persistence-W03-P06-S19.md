---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S19'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# add GET and PUT session endpoints carrying the tiers block

## Scope

- `engine/crates/vaultspec-api/src/routes/session.rs`

## Description

- Created the new route module `session.rs` with `get_session` and `put_session` handlers.
- `GET /session` returns the shared `{data, tiers}` envelope where `data` is `workspace`, `active_scope`, `scope_context` (`folder` + `feature_tags`), and `recents`, all snake_case.
- Read the active scope, that scope's context, and the recents through the shared `user_state` handle inside ONE scoped guard that drops before the envelope is built, honoring the never-hold-a-Mutex-guard-across-await discipline.
- `PUT /session` accepts a partial body: `active_scope`, `scope_context` (`scope`, `folder`, `feature_tags`), and `push_recent`; an absent field leaves that part untouched.
- On `active_scope`, validated and warmed the scope through the registry FIRST (before any user-state lock) so an unknown scope is a 400 carrying the tiers block, then retargeted and persisted the active scope.
- Persisted `scope_context` (defaulting to the active scope) and `push_recent` inside one scoped guard; PUT returns the same shape GET serves.
- Declared `pub mod session;` so the module compiles; router/gate wiring lands in S21/S22.

## Outcome

The session GET and PUT endpoints exist and carry the tiers block through the shared `envelope`/`api_error` helpers. `cargo build -p vaultspec-api` is clean. The wire shape is defined in clean snake_case as the contract W04's client and mock must mirror.

## Notes

- The registry warm of a new `active_scope` is done before the user-state lock is taken, so a cold-scope index never runs under that lock.
- No `.await` sits between a user-state lock and its release in any handler; the scoped-guard pattern is kept explicit so a future edit cannot silently introduce one.
