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
