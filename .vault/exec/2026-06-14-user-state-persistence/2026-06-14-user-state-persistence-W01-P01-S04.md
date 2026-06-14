---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S04'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S04 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The define the session and settings table schema and migration-free init and ## Scope

- `engine/crates/vaultspec-session/src/schema.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
