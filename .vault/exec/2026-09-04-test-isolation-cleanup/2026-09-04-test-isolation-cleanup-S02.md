---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-04'
modified: '2026-09-04'
body_schema: 'body-v2'
body_hash: 'sha256:8c8703be57ac9a175d23ed414523d28dd96a70a4a25f8ab5870ee3d2e22e8b33'
step_id: 'S02'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Add a guard suite that mounts in one case and asserts absence in the next, and validate it fails with the barrier removed

## Scope

- `frontend/src/testing/rtlCleanup.guard.test.tsx`

## Changes

- `A` `frontend/src/testing/rtlCleanup.guard.test.tsx`
- `verify:` `npx vitest run src/testing/rtlCleanup.guard.test.tsx` -> `pass`
- `verify:` `npx vitest run src/testing/rtlCleanup.guard.test.tsx` with the barrier unregistered -> `fail`
