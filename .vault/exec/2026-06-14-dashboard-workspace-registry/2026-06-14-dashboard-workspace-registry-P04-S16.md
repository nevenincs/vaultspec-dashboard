---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-22'
step_id: 'S16'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---




# Host the workspace switcher above the worktree switcher and render it as a quiet header when only one root exists

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Import the `WorkspacePicker` into the app shell and host it ABOVE the worktree switcher in the left scope rail, separated by the same rule divider, so the rail composes which PROJECT, then which worktree, then which document.
- The picker renders as a quiet header when only one root is registered (the single-project case stays uncluttered), and as an expandable picker otherwise — that quiet-header behaviour is owned by the picker itself, so the host just places it.

## Outcome

The host wiring is complete in the working tree and the full frontend suite, lint, format, and typecheck are green with the picker hosted. The left rail now offers the workspace switcher above the worktree switcher per the left-rail IA.

## Notes

COMMIT DEFERRED (not a code problem): the app-shell file carries uncommitted peer WIP from a concurrent campaign (a right-activity-rail "work" tab) interleaved in the SAME file. My left-rail edit is line-disjoint from that WIP, but committing the file with an explicit pathspec would absorb the peer's uncommitted changes into this commit, which the shared-worktree safety discipline forbids (and stash/reset/add-p are forbidden). The host edit is therefore left in the working tree and this step is held OPEN until the peer commits their app-shell WIP, at which point the host edit can be committed cleanly. This is recorded for the next executor in the handoff. The picker and all stores work it depends on are committed; only the one-line host placement awaits the peer commit.

## Resolution (2026-06-16)

The deferral has resolved. The left-rail composition was subsequently refactored
out of `AppShell.tsx` into a dedicated `frontend/src/app/left/LeftRail.tsx`
hosted-slot stack (the dashboard-left-rail ADR's "ordered stack of hosted slots"),
and that file — committed on a clean `main` — hosts `<WorkspacePicker />` ABOVE
`<WorktreePicker />`, separated by the soft 1px rule, with the quiet-header
single-root behaviour owned by the picker. The ordered stack is covered by
`LeftRail.render.test.tsx` (workspace → worktree → browser) and the picker's four
honest states by `WorkspacePicker.render.test.tsx`. The working tree is clean, the
host placement is committed, and the full frontend gate is green (eslint, prettier
format:check, tsc, 1779 tests). The step's intent — workspace switcher hosted above
the worktree switcher, quiet header when single root — is delivered; the host file
is `LeftRail.tsx`, not `AppShell.tsx`, reflecting the post-plan refactor.
