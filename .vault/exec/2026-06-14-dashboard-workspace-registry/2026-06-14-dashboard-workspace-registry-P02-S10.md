---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S10'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

# Mirror the /workspaces and extended /map and /session shapes in the frontend mock fixtures

## Scope

- `frontend/src/stores/server/`

## Description

- Add a `/workspaces` route to the frontend mock serving the same flat-with-tiers shape the live route serves: the registered roots (id, label, path, launch-default marker, reachability, reason) plus the active-workspace id.
- Add the `active_workspace` field to the mock `/session` data block, mirroring the live `/session`.
- Honor `active_workspace`, `add_workspace`, and `forget_workspace` in the mock PUT `/session`, mirroring the live route's validation, last-launch-root refusal, and read-only register semantics.
- Honor the optional `workspace=` param on the mock `/map`, 400ing an unknown registered id exactly like the live route, and add a `setWorkspaceReachable` test affordance for the degraded-root state.

## Outcome

The mock mirrors the live wire shape for `/workspaces`, the extended `/map`, and `/session` so the frontend stores adapters and hooks are exercised against the real wire shape through one client path. Mock + session frontend tests and the typecheck pass.

## Notes

The mock cannot probe a real filesystem, so `add_workspace` treats any non-empty path not prefixed `bad` as a valid project (deriving a stable id) and refuses `bad`-prefixed paths — enough to exercise the add/list/forget flow and the validation-refusal state through the real client path.
