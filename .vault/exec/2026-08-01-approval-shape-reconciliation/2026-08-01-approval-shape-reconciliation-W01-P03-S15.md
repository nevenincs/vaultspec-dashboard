---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:3d42b221b8e10eb3f889a92a955a0f4a9c764c41c30f4c23b41e409a2569a045'
step_id: 'S15'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Remove the session_override None line from the tool permission request fixture

## Scope

- `engine/crates/vaultspec-api/src/authoring/session/janitor.rs`

## Description

- Removed the `session_override: None,` line from the `ToolPermissionRequestInput` construction inside the janitor's `janitor_drives_permission_interrupt_and_lease_expiry` test fixture.

## Outcome

Compiles clean under `cargo clippy -p vaultspec-api --all-targets --no-deps` (zero warnings).

## Notes

None.
