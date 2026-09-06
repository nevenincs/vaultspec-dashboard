---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:3c2c872613ca61cda087228a6399c04e14e541b150601734af615225594b551a'
step_id: 'S08'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Add bounded unexpected-engine-exit diagnostics without retries or behavior changes

## Scope

- `frontend/src/testing/liveEngine.globalSetup.ts`

## Changes

- `M` `frontend/src/testing/liveEngine.globalSetup.ts`
- `A` `frontend/src/testing/liveEngine.globalSetup.test.ts`
- `verify:` `npx prettier --write src/testing/liveEngine.globalSetup.ts src/testing/liveEngine.globalSetup.test.ts` -> `pass`
- `verify:` `npx vitest run src/testing/liveEngine.globalSetup.test.ts` -> `pass`
- `verify:` `npm run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
