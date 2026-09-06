---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:f8415819454190628a98cc340732624850d823d9af7cd8951cddde767f88a802'
step_id: 'S11'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Correct the live system-program adapter test for running, crashed, and absent identity states

## Scope

- `frontend/src/stores/server/systemPrograms.live.test.ts`

## Changes

- `M` `frontend/src/stores/server/systemPrograms.live.test.ts`
- `verify:` `npx prettier --check src/stores/server/systemPrograms.live.test.ts` -> `pass`
- `verify:` `npx vitest run src/stores/server/systemPrograms.live.test.ts -t "carries that port and process id through the tolerant adapter"` -> `pass`
- `verify:` `npx vitest run src/stores/server/systemPrograms.live.test.ts` -> `pass`
- `verify:` `npm run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol re-review -> `pass`
