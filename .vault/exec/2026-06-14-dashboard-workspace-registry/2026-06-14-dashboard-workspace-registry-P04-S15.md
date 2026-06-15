---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S15'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---




# Author the WorkspacePicker rendering roots, launch-default and unreachable markers, and the add-a-project affordance

## Scope

- `frontend/src/app/left/WorkspacePicker.tsx`

## Description

- Author the `WorkspacePicker` chrome component: renders the registered roots with the launch-default marker (Lucide star) and an unreachable marker (Lucide warning with its reason), the active root marked by a grayscale-safe accent bar plus fill and weight, and the path as monospace identity on hover.
- Render as a quiet header (the project name plus the add-a-project affordance) when only one root is registered, and as an expandable picker when two or more exist.
- Add the add-a-project affordance: an absolute-path input that registers through the session mutation and surfaces the engine's validation refusal as a non-silent status line; plus a keyboard contract (arrow/Enter/Escape) over the roving row focus.
- Invoke the stores' `useSwapWorkspace` on selection (optimistic + durable), surfacing a rejected switch as the same status line.

## Outcome

The switcher reads the registry, the active marker, and degradation only through stores hooks, defines no workspace shape of its own, never fetches the engine, and invokes the stores swap action — chrome over the one projection, honoring the layer-ownership law. Its four honest states plus the add-refusal are proven by the P05 render test.

## Notes

The control owns no reset logic; the workspace-level wholesale reset lives in the stores `useSwapWorkspace`, exactly as the worktree switcher delegates to `setScope`.
