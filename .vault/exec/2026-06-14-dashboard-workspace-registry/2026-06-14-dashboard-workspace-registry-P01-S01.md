---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S01'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

# Define the WorkspaceRoot record and registry schema (stable id from git common dir, label, path, reachability)

## Scope

- `engine/crates/vaultspec-session/src/schema.rs`

## Description

- Add the `WorkspaceRoot` record to the session crate schema module: stable id (the canonical git common dir), operator label, absolute root path, launch-default marker, reachability boolean, and an optional unreachable reason, all serde-derived.
- Add the `workspace_registry` table DDL (id primary key, label, path, is_launch, position, reachable, unreachable_reason, updated_at) plus a position index, to the migration-free schema-init batch.
- Add the `ACTIVE_WORKSPACE_KEY` constant the active-workspace pointer rides on the existing global-settings kv surface.
- Extend the schema idempotency test to assert the new table exists.

## Outcome

The registry record type and durable table shape are defined and compile cleanly; `ensure_schema` creates the table idempotently on every open. The record is a pure config aggregate carrying no git dependency, keeping the session crate inside the read-and-infer fence.

## Notes

The stable id is derived by the caller (the API boot path) from a discovered git common dir and passed in, so the session crate stays git-free. The active-workspace selection reuses the global-settings kv table rather than a new table — a single pointer needs no dedicated schema.
