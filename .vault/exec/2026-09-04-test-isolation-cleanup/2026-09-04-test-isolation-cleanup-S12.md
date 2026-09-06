---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:4f22d78411eef25f5ec573af6444b2724811121c7e8be80798c9c90fe1ba59a8'
step_id: 'S12'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Remove the destructive per-test happy-dom abort path and its obsolete helper and guard while preserving RTL unmount and Vitest-owned file teardown

## Scope

- `frontend/src/testing/happyDOMAbort.ts`
- `frontend/src/testing/happyDOMAbort.guard.test.ts`
- `frontend/src/testing/liveSetup.ts`
- `frontend/src/testing/rtlCleanup.ts`
- `frontend/vite.config.ts`

## Changes

- `D` `frontend/src/testing/happyDOMAbort.ts`
- `D` `frontend/src/testing/happyDOMAbort.guard.test.ts`
- `M` `frontend/src/testing/liveSetup.ts`
- `M` `frontend/src/testing/rtlCleanup.ts`
- `M` `frontend/vite.config.ts`
- `verify:` `npm --prefix frontend test -- src/testing/rtlCleanup.guard.test.tsx` -> `pass`
- `verify:` `npm --prefix frontend run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
