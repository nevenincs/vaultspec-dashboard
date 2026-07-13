---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# define the session and settings table schema and migration-free init

## Scope

- `engine/crates/vaultspec-session/src/schema.rs`

## Description

- Author the migration-free DDL in `schema.rs`: a `session` blob table keyed by `(workspace, scope)`, a `recents` list table keyed by `(workspace, position)` with a value index, and a `settings` kv table keyed by `(scope, key)`.
- Use the empty-string `GLOBAL_SCOPE` sentinel for the workspace active-scope pointer and for global settings keys.
- Implement `ensure_schema` running `CREATE TABLE IF NOT EXISTS` on every open, with no `user_version` gate and no migration ladder, per the best-effort posture.

## Outcome

The schema is intentionally small and versionless: the session lives as a small JSON blob per `(workspace, scope)` rather than a wide column set, recents are an ordered deduped list, and settings carry a `scope` column that distinguishes global from scope-scoped keys. `ensure_schema` is idempotent, proven by a test that runs it twice and asserts all three tables exist. A shape mismatch is recreated by the store's `open_or_heal`, never migrated.

## Notes

None. The empty-string scope sentinel keeps global rows in the same tables as scoped rows without a nullable column, which `WITHOUT ROWID` primary keys require to be non-null.
