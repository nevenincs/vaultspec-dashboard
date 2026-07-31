---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
body_hash: 'sha256:44fdf010cc432f8eed00f14d83ecc42f32903742d37684d0df5bed350447f6cb'
step_id: 'S241'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Replace project setup action strings with typed descriptors

## Scope

- Project setup action producers, typed confirmation, tests, and scanner inventory.

## Description

- Map every served recommendation to a canonical localized action.
- Replace the custom armed state with the shared typed destructive confirmation dialog.
- Preserve the independent engine confirmation token and exact dispatch payload.
- Fail closed on missing localization and unknown future recommendations.

## Outcome

Project setup actions share one typed presentation contract. Destructive replacement
requires complete localized confirmation and retains the server-required safety token.

## Notes

The nine remaining legacy action presentations in this producer were removed. The
provisioning portion of S192 was updated, but S192 remains open for untouched tests.
