---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S25'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Add a Browse affordance to the add-project flow consuming the new directory-listing route (drill-down list, managed and git badges, select-to-fill-the-path), replacing typed-path-only entry for first-run onboarding and the project switcher alike

## Scope

- `frontend/src/app/left/AddProjectDialog.tsx`

## Description

- Add the stores seam: `useFsList` over GET `/fs/list` with a per-directory bounded cache key (`engineKeys.fsList`, deliberately NOT scope-bound - the browse is machine-level), `adaptFsList` in the listings adapter, and the `fsList` client method + `FsListResponse` types.
- Add `FolderBrowser` (pure `deriveFolderBrowserView` resolver + wired wrapper, mirroring the FirstRunOnboarding split): roots ("This computer") to one directory level per call, an up-row, Project / Git repository badges, honest loading/error/empty states, stated 256-row truncation, and "Choose this folder" filling the EXISTING add-project path input.
- Compose a Browse toggle into `AddProjectDialog` as chrome-local state; registration stays the untouched `useAddWorkspace` flow, so first-run onboarding and the project switcher both gain the picker for free.

## Outcome

Typed-path-only entry is retired: ADR O6 is closed end to end (served route + picker UI). 43 tests green including live-wire hook coverage; eslint, tsc, prettier clean.

## Notes

Executed by a delegated frontend coder that again went silent after finishing; verified and committed by the orchestrator. The shared adapter files carried the parallel session's in-flight vault-tree-delta hunks - cross-committed deliberately after whole-tree verification, with their consuming mutations.ts left to their lane.
