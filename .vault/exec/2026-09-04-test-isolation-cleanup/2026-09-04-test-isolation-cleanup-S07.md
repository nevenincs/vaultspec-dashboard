---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:3dda0f1359d1ca7a74055fe25fbc0b1a7578775b77ecb740e6da83e126174f41'
step_id: 'S07'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Add an awaited-abort and no-timer guard, and prove it fails both when awaiting is removed and when a fixed drain returns

## Scope

- `frontend/src/testing/happyDOMAbort.guard.test.ts`

## Changes

- `A` `frontend/src/testing/happyDOMAbort.guard.test.ts`
- `verify:` `remove await; npx vitest run src/testing/happyDOMAbort.guard.test.ts` -> `fail`
- `verify:` `restore fixed drain; npx vitest run src/testing/happyDOMAbort.guard.test.ts` -> `fail`
- `verify:` `npx prettier --check src/testing/happyDOMAbort.ts src/testing/happyDOMAbort.guard.test.ts` -> `pass`
- `verify:` `npx vitest run src/testing/happyDOMAbort.guard.test.ts src/testing/rtlCleanup.guard.test.tsx` -> `pass`
- `verify:` `npm run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
