---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S13'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

# Add a stores query hook for /workspaces and the active-workspace selector

## Scope

- `frontend/src/stores/server/`

## Description

- Add the `WorkspaceRoot` and `WorkspacesState` wire types and the registry-mutation fields (`active_workspace`, `add_workspace`, `forget_workspace`) to the session-update wire type, plus the `active_workspace` field on the session-state wire type.
- Add a `workspaces()` client method and a tolerant `adaptWorkspaces` adapter that defaults a sparse or older shape to safe empties, and extend `adaptSession` to carry `active_workspace`.
- Add the `useWorkspaces` query hook (8s error-state self-heal), the `deriveWorkspacesAvailability`/`useWorkspacesAvailability` degradation selector (structural tier), and `useActiveWorkspace`/`useWorkspaceRoots` selectors.
- Extend `usePutSession` to invalidate the workspaces key so a registry mutation refreshes the picker.

## Outcome

The frontend consumes the registry entirely through stores hooks: the picker reads roots, the active marker, and degradation through selectors, never the wire or the raw tiers block. Registry mutation rides the existing session mutation. The mock + session frontend tests and typecheck pass.

## Notes

The active-workspace selection and the registered roots are workspace-singular, so each carries one stable cache key, mirroring the session/settings keys.
