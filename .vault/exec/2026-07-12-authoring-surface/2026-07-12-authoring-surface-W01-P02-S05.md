---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S05'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Add the comments table migration with bounded per-document and per-store caps plus retention, and the typed repository over the authoring store

## Scope

- `engine/crates/vaultspec-session/src/authoring/store`

## Description

- Add schema-version-20 migration `create_authoring_comments` to the authoring store in `engine/crates/vaultspec-api/src/authoring/store/mod.rs`: a fresh additive `authoring_comments` table (no CHECK-widen, no table recreate) keyed by a stable `comment_id`, with queryable columns for `document_node_id`, author actor ref, `resolved`, `resolved_at_ms`, and `created_at_ms`, plus three supporting indexes (per-document listing, resolved-retention prune, author).
- Bump `SCHEMA_VERSION` from 19 to 20 and append the migration to `MIGRATIONS`.
- Add a `StoreError::Comment(String)` variant for the comment error domain.
- Extend the `clean_open` migration test to expect the new table (count 23 to 24), the version-20 applied migration, and the applied-migration length (19 to 20).
- Author the typed `CommentRepository` in `engine/crates/vaultspec-api/src/authoring/comments.rs` attaching to the unit-of-work boundary (`impl UnitOfWork { fn comments() }`), with `create`, `get`, `list_for_document`, `count_for_document`, `count_total`, `update_body`, `set_resolved`, `reanchor`, `delete`, and `prune_resolved_before`.
- Enforce resource bounds at creation: a 16 KiB body cap, a 500-comment per-document cap, a 50000-comment per-store cap, and a 180-day resolved-comment retention window pruned opportunistically on create.
- Add three `CommandKind` variants (`CreateComment`, `UpdateComment`, `DeleteComment`) in `model.rs` plus a `CommentId` id type, and map the new commands to `NotChangesetLifecycle` in `transitions.rs`.

## Outcome

The authoring store carries a bounded, durable comments table with a typed repository. Migration and repository unit tests pass against a real SQLite store (no mocks). Bounds are explicit constants with rationale, matching the resource-bounds law and the advisory-lease precedent for opting out of the formal retention/compaction lifecycle (a comment is an annotation, not rollback/review/audit material).

## Notes

- The plan names the crate `vaultspec-session`; the actual crate is `vaultspec-api` (`engine/crates/vaultspec-api`). Work landed in the real crate.
- Adding `StoreError::Comment` compile-forces one arm in the shared `http.rs` error-to-HTTP mapping; that single 422 (`authoring_comment_refused`) arm was already present when re-checked (added by the coordinating lane), so no route work was touched for S05.
- Full-crate `cargo test -p vaultspec-api` is blocked by the parallel P01 lane's in-flight S02 (`plan_step` field on `DraftMutation`, 51 unrelated construction-site errors); the comment module tests passed at the last point the crate compiled. Full gate re-run is deferred until the shared crate compiles.
