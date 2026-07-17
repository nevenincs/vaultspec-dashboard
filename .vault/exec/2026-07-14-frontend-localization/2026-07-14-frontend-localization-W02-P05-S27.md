---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S27'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Confirm typed command presentation normalization

## Scope

- `frontend/src/stores/view/commandRegistry.ts`
- `frontend/src/stores/view/commandRegistry.localization.test.ts`

## Description

- Make the command descriptor's inherited typed presentation contract explicit.
- Preserve the temporary branded legacy presentation branch during producer migration.
- Prove a production typed action survives command normalization without pre-translation.

## Outcome

Command descriptors explicitly carry the shared action presentation types through the registry. The existing canonical normalizer remains the only normalization path, and locale resolution remains outside the store boundary.

## Verification

- `just dev lint frontend`
- Two focused Vitest files, 15 tests
- Independent Sol review approved with no findings

## Notes

The scanner remains at 1,431 findings because this step formalizes an already-delivered architecture contract and adds no new user-facing copy.
