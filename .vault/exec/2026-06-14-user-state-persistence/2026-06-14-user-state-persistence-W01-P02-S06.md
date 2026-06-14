---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S06'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---




# implement the settings model with global and scoped keys

## Scope

- `engine/crates/vaultspec-session/src/settings.rs`

## Description

- Define the `Setting` key/value domain type in `settings.rs`.
- Add `global_setting`/`set_global_setting` over the `GLOBAL_SCOPE` sentinel and `scoped_setting`/`set_scoped_setting` over an explicit scope, sharing a private upsert and read helper.
- Add `list_settings` returning a scope's entries ordered by key.

## Outcome

Global and scope-scoped settings round-trip and update independently: a scoped key does not implicitly fall back to the global value, leaving precedence composition to the caller, and `list_settings` is scoped and key-ordered. The settings domain reuses the same `(scope, key)` table the schema defines, distinguishing global from scoped purely by the empty-string scope sentinel.

## Notes

Scoped settings deliberately do NOT fall back to global on a miss; the read returns `None` so a future API layer can compose the global-then-scoped precedence explicitly rather than having it baked into the store.
