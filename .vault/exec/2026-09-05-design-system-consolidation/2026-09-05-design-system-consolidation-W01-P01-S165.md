---
tags:
  - '#exec'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:bf7a9cac86af8188f7151a14c97995b9e62e50039a04d907d49d3a59b87148de'
step_id: 'S165'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# Classify ordinary text-field and textarea migration families across settings, dialogs, clarification, properties, review, and comments

## Scope

- `frontend/dev/design-system/consolidation-ledger.ts`

## Changes

- `M` `frontend/dev/design-system/consolidation-ledger.ts`
- `verify:` syntax-aware JSX and ledger identity/count probe -> `pass`
- `verify:` `npm --prefix frontend exec -- eslint frontend/dev/design-system/consolidation-ledger.ts` -> `pass`
- `verify:` `npm --prefix frontend run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent `gpt-5.6-sol` review -> `pass`
