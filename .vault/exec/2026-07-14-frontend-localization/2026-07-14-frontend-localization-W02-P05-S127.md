---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S127'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Define canonical operation concepts

## Scope

- `frontend/src/stores/server/opsActions.ts`
- `frontend/src/stores/server/opsActions.localization.test.ts`
- `frontend/src/locales/en/operations.ts`
- `frontend/src/locales/en/index.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/messagePolicy.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/scripts/localization-allowlist.json`

## Description

- Add one stable user concept and typed label descriptor to each authorized operation tuple.
- Export a canonical normalized route lookup reused by authorization and presentation consumers.
- Preserve target and verb as the sole dispatch identity.
- Add the operations catalog contract and real alternate-locale coverage.

## Outcome

The six authorized operations now have one canonical semantic identity and localized label without changing routing, order, or authorization. Downstream feedback can reuse concepts without parsing or displaying wire tokens.

## Verification

- `just dev lint frontend`
- Five focused Vitest files, 35 tests
- Three immutable-whitelist proofs
- Independent Sol review approved with no findings

## Notes

This step landed atomically with S30 so typed label descriptors could never be rendered through the former string wrapper.
