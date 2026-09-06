---
tags:
  - '#exec'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:2c0d64a19c864747a23d718733330e33dca55ea34d7467fe152018e0c552f517'
step_id: 'S177'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# Classify arbitrary relative values owned by left rail, right rail, settings, panels, and remaining surfaces

## Scope

- `frontend/dev/design-system/consolidation-ledger.ts`

## Changes

- `M` `frontend/dev/design-system/consolidation-ledger.ts`
- `verify:` `node --experimental-strip-types --input-type=module <S177 residual multiset probe>` -> `pass`
- `verify:` `npm run test -- dev/design-system/consolidation-ledger.test.ts` -> `pass`
- `verify:` `npm run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review and re-review -> `pass`
