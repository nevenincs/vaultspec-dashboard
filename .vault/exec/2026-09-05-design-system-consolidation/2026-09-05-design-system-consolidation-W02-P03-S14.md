---
tags:
  - '#exec'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:b2217580ab4ec2d4c9824c8ce0c26ff81d8164c713096896dcc0edf988d02efc'
step_id: 'S14'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# Implement the ordinary TextArea contract without absorbing editor or composer semantics

## Scope

- `frontend/src/app/kit/TextArea.tsx`

## Changes

- `A` `frontend/src/app/kit/TextArea.tsx`
- `M` `frontend/dev/design-system/consolidation-ledger.ts`
- `M` `frontend/dev/design-system/consolidation-ledger.test.ts`
- `M` `frontend/dev/tooling/scan-design-system.test.ts`
- `verify:` `npm --prefix frontend run lint:design-system` -> `pass`
- `verify:` `npx vitest run src/app/kit/TextField.render.test.tsx dev/design-system/consolidation-ledger.test.ts dev/tooling/scan-design-system.test.ts` -> `pass`
- `verify:` `npm --prefix frontend run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
