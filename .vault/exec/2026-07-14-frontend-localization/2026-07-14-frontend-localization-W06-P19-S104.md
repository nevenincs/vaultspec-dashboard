---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S104'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Exercise the live served application in its typical localized state

## Scope

- `frontend/e2e/localization-typical.spec.ts`

## Description

Added a Playwright spec run against the LIVE production `vaultspec serve` origin
(`playwright.config.ts`), proving three typical-state scenarios: the four-region
shell boots with real translated landmark labels; the document title and `<html
lang>` carry the shipped source locale; and the status rail renders real section
labels with no source-key leakage.

## Outcome

The typical localized state is proven live, over the real served application, not
a mocked DOM.

## Notes

Landed at commit `164ea9fc1d` ("live-browser localization e2e — typical +
expanded/RTL layout specs over a dev-only locale-injection lever, l10n
S138/S104/S105"). This record was authored during a fill pass reconciling the
team lead's verification request — no code changes by me.

Independently reverified: live rerun of `localization-typical.spec.ts` against
the real `vaultspec serve` origin — 3/3 passed, matching the claimed count.
