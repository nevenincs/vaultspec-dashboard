---
tags:
  - '#exec'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:252a1957489e43710eeb7e3d94184c8d8ad9171feca4a1aebd7985e53c435f71'
step_id: 'S20'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# Pin ActivityIndicator appearance and accessibility behavior before exposing it through the public boundary

## Scope

- `frontend/src/app/kit/ActivityIndicator.render.test.tsx`

## Changes

- `A` `frontend/src/app/kit/ActivityIndicator.render.test.tsx`
- `verify:` `npx vitest run src/app/kit/ActivityIndicator.render.test.tsx` -> `pass`
- `verify:` `npx vitest run src/app/kit/ActivityIndicator.render.test.tsx dev/design-system/consolidation-ledger.test.ts dev/tooling/scan-design-system.test.ts --testTimeout 120000` -> `pass`
- `verify:` `npm --prefix frontend run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
