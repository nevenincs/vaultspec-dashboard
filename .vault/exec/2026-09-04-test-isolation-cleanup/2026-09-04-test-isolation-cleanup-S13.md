---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:4ffbe2fb66a3bf6dbbf1f08b18bc0c228be793f8d4f6e1fbaf7e7546e49fb2e4'
step_id: 'S13'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Add a cross-test lifecycle guard proving the harness never calls happy-dom abort between cases and demonstrate it red with the removed hook restored

## Scope

- `frontend/src/testing/perTestWindowLifecycle.guard.test.ts`

## Changes

- `A` `frontend/src/testing/perTestWindowLifecycle.guard.test.ts`
- `verify:` restored per-test abort mutation -> `fail`
- `verify:` `npm --prefix frontend test -- src/testing/perTestWindowLifecycle.guard.test.ts src/testing/rtlCleanup.guard.test.tsx` -> `pass`
- `verify:` `npm --prefix frontend run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
