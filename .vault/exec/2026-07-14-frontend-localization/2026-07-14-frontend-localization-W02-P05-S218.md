---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S218'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate document-tab keybinding definitions and actionable disabled reasons

## Scope

- Document-tab keybindings, live action registration, document catalogs, policy, localization tests, and scanner baseline.

## Description

- Share typed descriptors between keybinding definitions and registered actions.
- Replace the raw unavailable reason with the actionable message Open a document first.
- Exercise real registries, store navigation, close behavior, and English, French, and Arabic resolution.

## Outcome

Document-tab shortcuts now contain no legacy action or keybinding presentation strings, and unavailable actions explain what the user should do next.

## Notes

Terra implemented the migration and corrected wording found by Sol and the integrated policy gate. The full frontend gate passed.
