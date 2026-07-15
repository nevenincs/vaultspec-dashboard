---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S184'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize pull-request menu actions

## Scope

- Pull-request menu descriptors, recovery, clipboard labels, catalogs, tests, and scanner allowlist.

## Description

- Replace open and unavailable strings with typed project descriptors.
- Provide an actionable recovery message when the remote link is unavailable.
- Name pull-request link and number copy actions explicitly.
- Preserve external navigation and raw user-domain clipboard values.

## Outcome

Pull-request menus now use consistent product naming and localized action descriptors.

## Notes

Six exact scanner rows were removed across S182 and S184, reducing legacy action
presentations from 22 to 16. S185 remains open for the remaining right-rail tests.
