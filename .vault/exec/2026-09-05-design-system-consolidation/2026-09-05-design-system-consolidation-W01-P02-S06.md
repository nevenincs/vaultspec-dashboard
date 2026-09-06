---
tags:
  - '#exec'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:57999494bced899e34dc85187223d5be97c8037a9b3dc0d1b0158e0069f40ae5'
step_id: 'S06'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# Implement the bounded native-control, arbitrary-value, kit-import, layer-direction, facade, and ledger-consistency scanner

## Scope

- `frontend/dev/tooling/scan-design-system.mjs`

## Changes

- `A` `frontend/dev/tooling/scan-design-system.mjs`
- `verify:` `node --check dev/tooling/scan-design-system.mjs` -> `pass`
- `verify:` `node dev/tooling/scan-design-system.mjs --json` -> `pass`
- `verify:` runtime ledger mutation probes -> `pass`
- `verify:` `npm run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
