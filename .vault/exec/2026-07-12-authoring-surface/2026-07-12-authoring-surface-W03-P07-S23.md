---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
body_hash: 'sha256:cc25e21866b767af37ae159aa81aa6a4774c40a450673a3170d4c5a34b186940'
step_id: 'S23'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Add the New-document secondary button to the workspace empty state through the shared new-document action

## Scope

- `frontend/src/app/stage/WorkspaceGhost.tsx`

## Description

- Add a secondary New-document button to the workspace empty state beside Show graph, dispatching the shared new-document action's run.
- Widen the empty-state copy to name the create path.
- Add a render test asserting both buttons render and that the New-document click flips the create-document chrome store open.

## Outcome

The highest-conversion empty moment now offers document creation through the one shared descriptor, no bespoke handler. Render test green.

Modified files:

- `frontend/src/app/stage/WorkspaceGhost.tsx`
- `frontend/src/app/stage/WorkspaceGhost.render.test.tsx` (new)

## Notes

None.
