---
tags:
  - '#exec'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:7aa67cff6f9c27fea674e6b69cdbc0d1afcd70448f22de18e7df37969896548f'
step_id: 'S173'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# Classify arbitrary relative values owned by shared chrome, dialogs, sheets, and shell composition

## Scope

- `frontend/dev/design-system/consolidation-ledger.ts`

## Changes

- `M` `frontend/dev/design-system/consolidation-ledger.ts`
- `verify:` `node --input-type=module --experimental-strip-types <S173 multiset probe>` -> `pass`
- `verify:` `npm run test -- dev/design-system/consolidation-ledger.test.ts` -> `pass`
- `verify:` `npm run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review and re-review -> `pass`
