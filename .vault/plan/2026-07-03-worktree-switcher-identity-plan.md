---
tags:
  - '#plan'
  - '#worktree-switcher-identity'
date: '2026-07-03'
modified: '2026-07-03'
tier: L1
related:
  - '[[2026-07-03-worktree-switcher-identity-adr]]'
  - '[[2026-07-03-worktree-switcher-identity-audit]]'
---

# `worktree-switcher-identity` plan

Centralize the project/worktree/branch/path identity in the left-rail switcher and delete
the duplicated right-rail location display.

## Description

Executes the accepted worktree-switcher-identity ADR: the left-rail trigger becomes the one
location identity block (project, worktree title with hugging chevron, pending-aware git
line, absolute path), the dropdown rows gain distinguishing labels (project-led recents,
branch on worktree rows, project-named disclosure, one leading glyph column), user-facing
strings drop internal vocabulary, and the right-rail LocationStrip plus its location-anchor
selector family are deleted with no bridge. Frontend-only; live-wire tests move with the
renamed strings in the same steps.

## Steps

- [x] `S01` - Thread the active-project label, pending-aware headline worktree, and per-row branch label through the picker presentation view, and rewrite user-facing strings in plain sentence case (drop scope, workspace, vault-bearing, bare); `frontend/src/stores/server/queries.ts`.
- [x] `S02` - Rebuild the trigger as the one identity block (project line, hugging chevron, pending-aware git line, path line), align dropdown rows on one leading glyph column, lead cross-project recents with the project, show branch on worktree rows, drop the false listbox promise; `frontend/src/app/left/WorktreePicker.tsx`.
- [x] `S03` - Rewrite the switch-failure messages in plain sentence case and expose the active-project label from the picker view seam; `frontend/src/stores/view/worktreePickerChrome.ts`.
- [x] `S04` - Lead cross-project recent rows with the project in the navigator popup via the shared row label; `frontend/src/app/left/ProjectNavigator.tsx`.
- [x] `S05` - Delete the LocationStrip and the location-anchor selector family with no bridge; `frontend/src/app/right/StatusTab.tsx`.
- [x] `S06` - Move the live-wire test assertions to the new labels and delete the location-anchor tests; `frontend/src/app/left/WorktreePicker.render.test.tsx`.
- [x] `S07` - Run the full frontend lint gate and the touched vitest suites, then live-verify the switcher with fresh captures; `frontend/`.

## Parallelization

S01 must land before S02 and S03 (they consume the new presentation fields). S04, S05, and
S06 are independent of each other once S01 through S03 land. S07 is the closing gate and
runs last.

## Verification

- `just dev lint frontend` exits 0 (eslint + prettier + tsc).
- The touched live-wire suites pass: the picker render suite, the picker chrome store
  suite, and the stores presentation suite.
- No source reference to the location-anchor selector family or the LocationStrip remains.
- A fresh live capture shows the trigger stating project, worktree, branch, and path in one
  block, and dropdown rows distinguishable when worktree basenames collide.
