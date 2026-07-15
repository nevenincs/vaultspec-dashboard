---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S178'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize document-tab menu actions and disabled reasons

## Scope

- Document-tab action descriptors, catalogs, policy, tests, and exact scanner allowlist.

## Description

- Replace seven legacy presentations with typed message descriptors.
- Reuse the canonical Close action and add clear tab-specific actions.
- Replace state descriptions with actionable disabled reasons.
- Verify genuine English, French, and Arabic resolution through production descriptors.

## Outcome

Document-tab menus now use concise sentence-case actions without changing IDs, order,
sections, icons, effects, or eligibility behavior.

## Notes

Twenty-six focused tests and the complete frontend lint recipe passed. Terra and the
independent reviewer reported no findings. The scanner is clean at 1,035 findings,
including 22 remaining legacy action presentations.
