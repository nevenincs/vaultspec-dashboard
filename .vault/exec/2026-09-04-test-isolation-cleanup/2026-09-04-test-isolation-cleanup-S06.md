---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:ad1300404b602b8cceb9a046d948b00b0c0235cdae60bb4e5c3245cb5e1dbdb0'
step_id: 'S06'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Await native happy-dom abort directly, remove the fixed drain, and make serial worker configuration truthful

## Scope

- `frontend/src/testing/happyDOMAbort.ts`
- `frontend/src/testing/liveSetup.ts`
- `frontend/src/testing/rtlCleanup.ts`
- `and frontend/vite.config.ts`

## Changes

- `A` `frontend/src/testing/happyDOMAbort.ts`
- `M` `frontend/src/testing/liveSetup.ts`
- `M` `frontend/src/testing/rtlCleanup.ts`
- `M` `frontend/vite.config.ts`
- `verify:` `npx prettier --check src/testing/happyDOMAbort.ts src/testing/liveSetup.ts src/testing/rtlCleanup.ts vite.config.ts` -> `pass`
- `verify:` `npx vitest run src/testing/rtlCleanup.guard.test.tsx` -> `pass`
- `verify:` `npm run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
