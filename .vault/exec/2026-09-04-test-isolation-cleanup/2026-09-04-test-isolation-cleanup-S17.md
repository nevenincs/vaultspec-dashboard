---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:0a1dd3e7013c7e6c5bb2241433821e077b6bf32333257134bd3b6c7bd5a0d8d5'
step_id: 'S17'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Install and mutation-prove an owner-enrolled live-render teardown that awaits finite queries before RTL unmount, then awaits S16 stream cancellation and a separately exposed authoring stop-settlement promise before clearing clients, and apply it to AgentPanel and Composer

## Scope

- `frontend/src/testing/queryTeardown.ts`
- `frontend/src/testing/queryTeardown.test.ts`
- `frontend/src/app/agent/AgentPanel.render.test.tsx`
- `frontend/src/app/agent/Composer.render.test.tsx`
- `frontend/src/stores/server/authoring/index.ts`
- `frontend/src/stores/server/authoring.test.ts`

## Changes

- `A` `frontend/src/testing/queryTeardown.ts`
- `A` `frontend/src/testing/queryTeardown.test.ts`
- `M` `frontend/src/app/agent/AgentPanel.render.test.tsx`
- `M` `frontend/src/app/agent/Composer.render.test.tsx`
- `M` `frontend/src/stores/server/authoring/index.ts`
- `M` `frontend/src/stores/server/authoring.test.ts`
- `verify:` `npm --prefix frontend test -- src/testing/queryTeardown.test.ts src/stores/server/authoring.test.ts` -> `pass`
- `verify:` `npm --prefix frontend test -- src/testing/queryTeardown.test.ts src/stores/server/authoring.test.ts src/app/agent/AgentPanel.render.test.tsx src/app/agent/Composer.render.test.tsx` -> `pass`
- `verify:` `npm --prefix frontend test -- src/testing/queryTeardown.test.ts` -> `pass`
- `verify:` `npm --prefix frontend run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` `independent Sol review` -> `pass`
