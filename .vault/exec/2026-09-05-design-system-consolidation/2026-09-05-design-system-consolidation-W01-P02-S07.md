---
tags:
  - '#exec'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:ad5308811ba29fa9e2b191ff00e2ff7a0a810721da8f7bfb68fba37e30fff40a'
step_id: 'S07'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# Add valid and invalid scanner fixtures for classified seams, missing entries, stale entries, deep imports, store-to-kit imports, and compatibility facades

## Scope

- `frontend/dev/tooling/fixtures/design-system/`

## Changes

- `M` `frontend/dev/tooling/scan-design-system.mjs`
- `A` `frontend/dev/tooling/scan-design-system.d.mts`
- `A` `frontend/dev/tooling/fixtures/design-system/manifest.ts`
- `A` `frontend/dev/tooling/fixtures/design-system/run-fixtures.mjs`
- `A` `frontend/dev/tooling/fixtures/design-system/run-fixtures.d.mts`
- `A` `frontend/dev/tooling/fixtures/design-system/valid/classified-seams.tsx`
- `A` `frontend/dev/tooling/fixtures/design-system/valid/comment-and-unitless-exclusions.tsx`
- `A` `frontend/dev/tooling/fixtures/design-system/valid/behavior-bearing-wrapper.tsx`
- `A` `frontend/dev/tooling/fixtures/design-system/invalid/missing-native-entry.tsx`
- `A` `frontend/dev/tooling/fixtures/design-system/invalid/missing-relative-entry.tsx`
- `A` `frontend/dev/tooling/fixtures/design-system/invalid/stale-native-entry.tsx`
- `A` `frontend/dev/tooling/fixtures/design-system/invalid/malformed-source.tsx`
- `A` `frontend/dev/tooling/fixtures/design-system/invalid/deep-kit-import.ts`
- `A` `frontend/dev/tooling/fixtures/design-system/invalid/duplicate-deep-import-ratchet.ts`
- `A` `frontend/dev/tooling/fixtures/design-system/invalid/store-to-kit-import.ts`
- `A` `frontend/dev/tooling/fixtures/design-system/invalid/platform-to-kit-import.ts`
- `A` `frontend/dev/tooling/fixtures/design-system/invalid/direct-reexport-facade.ts`
- `A` `frontend/dev/tooling/fixtures/design-system/invalid/local-reexport-facade.ts`
- `A` `frontend/dev/tooling/fixtures/design-system/invalid/export-assignment-facade.ts`
- `A` `frontend/dev/tooling/fixtures/design-system/invalid/forwarding-wrapper-facade.tsx`
- `verify:` `node dev/tooling/fixtures/design-system/run-fixtures.mjs` -> `pass`
- `verify:` `node dev/tooling/scan-design-system.mjs --json` -> `pass`
- `verify:` `npm run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
