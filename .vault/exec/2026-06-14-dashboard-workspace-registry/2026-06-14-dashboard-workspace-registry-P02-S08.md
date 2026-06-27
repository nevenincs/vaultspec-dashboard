---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S08'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

# Add the active_workspace field and its PUT handling to the session endpoint

## Scope

- `engine/crates/vaultspec-api/src/routes/session.rs`

## Description

- Add the `active_workspace` field to the `/session` GET data block beside the active scope, read from the global-settings surface.
- Add `active_workspace` to the PUT `/session` update body: validate it names a registered root (an unregistered id is a tiered 400 leaving the selection unchanged), then persist the active-workspace pointer.

## Outcome

`/session` now carries the active-workspace selection both ways. A route test exercises the active-workspace validation via the registry-mutation tests; selection persists through the same user-state config mechanism the active scope already uses.

## Notes

The active-workspace selection is a config write only; the engine never re-points scope or resets state on selection — the frontend's wholesale reset owns that, so the engine just records the chosen root.
