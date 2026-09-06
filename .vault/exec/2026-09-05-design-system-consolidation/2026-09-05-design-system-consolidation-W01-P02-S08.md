---
tags:
  - '#exec'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:f98530a495b44cca8fa7e6be0ac577719e59c27da90c21ead4a68aec8f22e1f9'
step_id: 'S08'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# Add focused scanner tests covering all ledger and ownership failure modes

## Scope

- `frontend/dev/tooling/scan-design-system.test.ts`

## Changes

- `M` `frontend/dev/tooling/scan-design-system.mjs`
- `M` `frontend/dev/tooling/scan-design-system.d.mts`
- `A` `frontend/dev/tooling/scan-design-system.test.ts`
- `verify:` `node dev/tooling/scan-design-system.mjs --json` -> `pass`
- `verify:` `node dev/tooling/fixtures/design-system/run-fixtures.mjs` -> `pass`
- `verify:` `npx vitest run dev/tooling/scan-design-system.test.ts --config vite.config.ts` -> `pass`
- `verify:` `npm run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
