---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S39'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Replace menu outcome strings with typed feedback conditions

## Scope

- `frontend/src/stores/view/actionFeedback.ts`
- `frontend/src/stores/view/actionFeedback.test.ts`
- `frontend/src/stores/server/menuActionOutcome.ts`
- `frontend/src/stores/server/menuActionOutcome.test.ts`
- `frontend/src/locales/en/common.ts`
- `frontend/src/locales/en/documents.ts`
- `frontend/src/locales/en/features.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/messagePolicy.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/scripts/localization-allowlist.json`

## Description

- Replace stored menu feedback strings with a frozen closed condition vocabulary.
- Map archive, repair, copy, and document-link outcomes to exhaustive catalog descriptors.
- Preserve repeat-announcement tokens and invalid-input inertia.
- Prevent raw dispatch, result, reason, path, and exception data from entering UI feedback.

## Outcome

Persistent action feedback now contains only bounded user-facing conditions. Known successes, refusals, conflicts, progress, and unavailable outcomes map to clear catalog messages; unknown settled actions remain silent and malformed recognized actions fail closed.

## Verification

- `just dev lint frontend`
- Expanded author and independent menu suites, 127 tests
- Independent Terra review approved with no findings

## Notes

This step landed atomically with the remaining S31 React boundary. Six obsolete localization exemptions were removed, reducing the scanner from 1,415 to 1,409 findings.
