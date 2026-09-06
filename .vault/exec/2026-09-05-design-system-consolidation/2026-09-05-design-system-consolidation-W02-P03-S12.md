---
tags:
  - '#exec'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:170f2e9d674b6e6ef6d9b30eeea2ab7fe566d9c792a2d10b0073c84e133a9a76'
step_id: 'S12'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# Implement the ordinary TextField contract with accessible labeling, focus, disabled, size, and theme behavior

## Scope

- `frontend/src/app/kit/TextField.tsx`

## Changes

- `A` `frontend/src/app/kit/TextField.tsx`
- `M` `frontend/dev/design-system/consolidation-ledger.ts`
- `M` `frontend/dev/design-system/consolidation-ledger.test.ts`
- `M` `frontend/dev/tooling/scan-design-system.mjs`
- `M` `frontend/dev/tooling/scan-design-system.test.ts`
- `verify:` `npm --prefix frontend run lint:design-system` -> `pass`
- `verify:` `npx vitest run dev/design-system/consolidation-ledger.test.ts dev/tooling/scan-design-system.test.ts` -> `pass`
- `verify:` `npm --prefix frontend run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review and re-review -> `pass`
