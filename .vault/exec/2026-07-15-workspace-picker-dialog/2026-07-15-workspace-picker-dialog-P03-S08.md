---
tags:
  - '#exec'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-17'
step_id: 'S08'
related:
  - "[[2026-07-15-workspace-picker-dialog-plan]]"
---

# Add the places rail (home, drives, registered projects, recents) composed from the served places block and the existing useWorkspaces and useProjectHistory seams, collapsing to a chip row on compact, with tests

## Scope

- `frontend/src/app/left (places rail within the picker)`

## Description

- Create `PickerPlacesRail` (`frontend/src/app/left/PickerPlacesRail.tsx`): a pure resolver (`derivePickerPlaces`) plus thin wired wrapper composing ONLY existing seams — the roots `useFsList` read (engine-served Home place + drives), `useWorkspaceRoots` (registered projects), and the session recents (deduplicated worktree paths, capped at three)
- Project rows carry the shared `workspaceRootName` derivation (caught in the live drive: raw registry labels rendered every project as "main" under the `<repo>-worktrees/<branch>` layout) and navigate to the root's parent directory (ADR D3)
- Collapse the vertical rail to a horizontally scrolling chip row on compact widths with responsive classes over one DOM
- Localize the rail under `projects:placesRail`; add resolver tests (section composition, dedup/cap, empty-section suppression)

## Outcome

One click re-roots the browser at Home, a drive, a registered project's neighborhood, or a recent worktree — the ADR D3 places contract, live-verified.

## Notes

- The rail's per-section test resources were split into `pickerResources.ts` when the additions pushed the test-locale catalog over the 1500-line module gate (following the existing `addProjectResources.ts` precedent).
