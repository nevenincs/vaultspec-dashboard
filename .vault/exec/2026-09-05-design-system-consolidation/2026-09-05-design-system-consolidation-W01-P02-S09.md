---
tags:
  - '#exec'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:b5f22a2922a0340f48cdb75178d66abe2616beeeddd022ed5f03e2322ae5d87b'
step_id: 'S09'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# Register the design-system scanner as a frontend lint script while preserving unrelated package edits

## Scope

- `frontend/package.json`

## Changes

- `M` `frontend/package.json`
- `verify:` `npm run lint:design-system` -> `pass`
- `verify:` `node dev/tooling/fixtures/design-system/run-fixtures.mjs` -> `pass`
- `verify:` `npx vitest run dev/tooling/scan-design-system.test.ts --config vite.config.ts` -> `pass`
- `verify:` `npm run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
