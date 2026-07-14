---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S245'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Seed canonical shared action, disabled-reason, and explicit confirmation catalog ownership before changing producer types

## Scope

- `frontend/src/locales/en/`
- `frontend/src/localization/messagePolicy.ts`
- `frontend/src/localization/messagePolicy.test.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/testing/resources.ts`

## Description

- Added canonical English catalogs for shared actions and disabled reasons, document actions, feature confirmations, and project actions.
- Extended the message policy with explicit ownership for every seeded key, actionable disabled-reason validation, and the required imperative and destructive verbs.
- Expanded the independent catalog-key oracle and source-backed structural namespace coverage for left-to-right and right-to-left test resources.
- Added focused policy coverage proving non-actionable disabled reasons fail while every production disabled reason passes.
- Verified formatting, targeted lint, TypeScript compilation, and 23 focused localization and runtime tests.

## Outcome

The source locale now owns the approved shared action, disabled-state, and confirmation messages under the `common`, `documents`, `features`, and `projects` namespaces. Disabled reasons must give the user a next step, and the strict feature archive action remains classified as destructive. Alternate-locale fixtures provide source-backed structural namespace coverage only; translation-distinct resources remain deferred to S138.

## Notes

The approved `Switch project` seed required adding `Switch` to the imperative action vocabulary so the production catalog satisfies its action policy. No producer types or confirmation descriptor contracts changed in this step.
