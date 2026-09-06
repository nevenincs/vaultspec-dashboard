---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:7d8dad1b6952df07d2f7c8a13973c383cf36ab53e0cd9e7ed4320d679b8d35bd'
step_id: 'S09'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Run frontend/src/app/left/AddProjectDialog.localization.test.tsx, frontend/src/app/left/CreateDocDialog.render.test.tsx, frontend/src/stores/server/comments.live.test.ts, frontend/src/stores/server/systemPrograms.live.test.ts, frontend/src/stores/server/queries/docmeta.test.ts, both barrier guards, and full frontend lint

## Scope

- `frontend`

## Changes

- `verify:` `npx vitest run src/app/left/AddProjectDialog.localization.test.tsx src/app/left/CreateDocDialog.render.test.tsx src/stores/server/comments.live.test.ts src/stores/server/systemPrograms.live.test.ts src/stores/server/queries/docmeta.test.ts src/testing/happyDOMAbort.guard.test.ts src/testing/rtlCleanup.guard.test.tsx` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
