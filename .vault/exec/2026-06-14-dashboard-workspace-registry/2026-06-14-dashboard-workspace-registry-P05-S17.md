---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S17'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

# Extend the scope-isolation adversarial tests to cover workspace swaps with no cross-project state bleed

## Scope

- `frontend/src/stores/__adversarial__/`

## Description

- Add an adversarial isolation test for the workspace swap (the 018/022/023 cross-scope class widened to the workspace level): pin a node and stamp per-scope view state under project A, swap to project B via `swapWorkspace`, and assert the full 022 reset ran AND the pin/lens stores re-keyed to workspace B so project A's pins/lenses are no longer the active membership.
- Add a second case proving a pin made under project B persists under B's key, never merged with A's stale pins.

## Outcome

Cross-project state bleed is guarded: the workspace swap is proven to clear at least as much as a worktree swap plus re-key pins/lenses to the new workspace. The test passes against the `swapWorkspace` implementation and would fail if the reset were narrowed to only flip the scope.

## Notes

The test exercises the pure view-store reset action directly (no React Query), isolating the cross-project-bleed invariant the way the existing isolation-01/02/03 adversarial tests isolate the worktree-swap invariant.
