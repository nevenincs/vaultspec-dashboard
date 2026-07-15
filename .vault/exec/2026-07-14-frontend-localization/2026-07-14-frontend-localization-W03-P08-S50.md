---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S50'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize code-file menu actions through shared action and clipboard presentation boundaries

## Scope

- Code-file menu descriptors, the shared canvas action, raw clipboard handling, catalogs, scanner allowlist, and behavior tests.

## Description

- Replace code-file menu strings with typed descriptors.
- Reuse the shared canvas action while preserving stable behavior.
- Keep copied file paths as untranslated user data.
- Prove English, French, and Arabic resolution.

## Outcome

Code-file actions resolve at presentation boundaries without changing IDs, ordering, eligibility, navigation, or copied path bytes.

## Notes

Sol approved the atomic menu contract with no findings. The focused suite passed 87 tests, and the complete frontend gate passed.
