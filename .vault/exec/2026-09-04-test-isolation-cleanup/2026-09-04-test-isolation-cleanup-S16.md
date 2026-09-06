---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:921ca301be4d30bf637cf6634e4ed75bd7ea3bd017aac311239151f2fa3653f4'
step_id: 'S16'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Implement and mutation-prove a shared two-phase SSE cancellation contract that aborts only pending response acquisition, then gracefully cancels the response reader, and route engine, A2A, and authoring lifecycle streams through it

## Scope

- `frontend/src/stores/server/queries/sse.ts`
- `frontend/src/stores/server/queries/streams.ts`
- `frontend/src/stores/server/queries/streams.test.ts`
- `frontend/src/stores/server/agent/a2aTeam.ts`
- `frontend/src/stores/server/authoring/index.ts`
- `frontend/src/stores/server/authoring.test.ts`

## Changes

- `M` `frontend/src/stores/server/queries/sse.ts`
- `M` `frontend/src/stores/server/queries/streams.ts`
- `M` `frontend/src/stores/server/queries/streams.test.ts`
- `M` `frontend/src/stores/server/agent/a2aTeam.ts`
- `M` `frontend/src/stores/server/authoring/index.ts`
- `M` `frontend/src/stores/server/authoring.test.ts`
- `verify:` `npm --prefix frontend test -- src/stores/server/queries/streams.test.ts src/stores/server/authoring.test.ts` -> `pass`
- `verify:` `npm --prefix frontend exec -- tsc --noEmit -p frontend/tsconfig.json` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` `independent Sol review` -> `pass`
