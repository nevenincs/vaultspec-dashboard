---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S01'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

# Refactor the left aside into the ordered hosted-slot stack separated by soft 1px rules

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Extract the rail content stack into a dedicated `LeftRail` composition component so the heavy composition lives in a left-rail-exclusive new file rather than in the peer-entangled `AppShell`.
- Compose the ordered hosted slots top to bottom: workspace switcher, then worktree switcher, then the browser region, each separated by a soft 1px `border-rule` rule.
- Reduce the `AppShell` left-rail body to a single `LeftRail` mount.

## Outcome

The rail renders as an ordered coarse-to-fine hosted-slot stack with soft 1px rules. The substantive composition is committed in `LeftRail`; the one-line `AppShell` host swap is implemented in-tree but its commit is DEFERRED.

## Notes

`AppShell` carries uncommitted activity-rail peer edits (`WorkTab`, the four-tab `RAIL_TABS`) plus the workspace-registry handoff host. To avoid absorbing peer work in a pathspec commit, the rail composition was moved into a new `LeftRail` file (committed) and `AppShell` only mounts it; the `AppShell` edit is deferred until the activity-rail and workspace-registry campaigns disentangle.
