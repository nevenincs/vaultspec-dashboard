---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S04'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Implement synchronous localization runtime initialization

## Scope

- `frontend/src/platform/localization/runtime.ts`

## Description

- Derive supported locales and namespaces from the bundled TypeScript catalogs.
- Augment i18next resource and default-namespace types for strict static key checks.
- Initialize each real runtime synchronously with the React adapter and shipped resources.
- Route missing keys, values, objects, and empty results to the safe source-catalog message.
- Export a fresh-instance production factory and one initialized application singleton.

## Outcome

- `createLocalizationRuntime` returns a distinct initialized instance before control
  returns to its caller.
- `localization` is ready for the later provider and application-mount steps without
  importing browser or store authority.
- Targeted Prettier, ESLint, and TypeScript 6 checks completed successfully.

## Notes

- Provider mounting, document attributes, locale preference, and runtime tests remain in
  their assigned plan steps.
- No incidents or skipped S04 work.
