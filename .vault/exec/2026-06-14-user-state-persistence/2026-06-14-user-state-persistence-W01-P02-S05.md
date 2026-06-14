---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S05'
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
     The S05 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The implement the session model for active workspace and scope and per-scope folder and feature-tag contexts and recents and ## Scope

- `engine/crates/vaultspec-session/src/session.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# implement the session model for active workspace and scope and per-scope folder and feature-tag contexts and recents

## Scope

- `engine/crates/vaultspec-session/src/session.rs`

## Description

- Define the `ScopeContext` domain type in `session.rs`: the active folder and its feature-tag contexts, serde-serialized into the per-scope session blob, built on the existing `feature_tags` grouping primitive.
- Add `active_scope`/`set_active_scope` reading and writing the workspace active-scope pointer at the `GLOBAL_SCOPE` sentinel row.
- Add `scope_context`/`set_scope_context` reading and writing each scope's folder and tags, defaulting a missing or unparseable blob to the empty context (corrupt-reads-as-default tolerance).
- Add `push_recent`/`recents`: most-recent-first, deduped by value, bounded to `MAX_RECENTS`, with positions densely renumbered on each push.

## Outcome

The session domain round-trips active scope and per-scope context, keeps distinct scopes independent, and maintains recents most-recent-first with dedupe and a fifty-entry bound. A re-push of an existing recent moves it to the front rather than duplicating. The crate-internal `conn()` accessor is now exercised, clearing the transient mid-wave dead-code warning.

## Notes

`push_recent` rewrites the workspace recents rows in full on each call to keep `position` dense and monotonic; at the fifty-entry bound this is a tiny table and the simplicity is worth more than an in-place reorder.
