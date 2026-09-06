---
tags:
  - '#exec'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:807b41451c10257dbd7a7f15aeef2cbbaa2aaba58ee691550580b83832ebe416'
step_id: 'S180'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# Ledger every new code-only primitive export, design alias, and naming-contract exception before public exposure

## Scope

- `frontend/dev/design-system/consolidation-ledger.ts`

## Changes

- `M` `frontend/dev/design-system/consolidation-ledger.ts`
- `verify:` `npx vitest run dev/design-system/consolidation-ledger.test.ts` -> `pass`
- `verify:` `npx vitest run dev/tooling/scan-design-system.test.ts -t "fails every remaining baseline, staleness, and scene-preimage rule"` -> `pass`
- `verify:` `npm run lint:design-system` -> `pass`
- `verify:` `npm run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
