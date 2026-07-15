---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S224'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize vault-document menu actions through the shared canvas action boundary

## Scope

- Vault-document descriptors, the shared canvas action, catalogs, scanner allowlist, and behavior tests.

## Description

- Replace the document menu string with the canonical canvas descriptor.
- Preserve action identity, navigation, scope, eligibility, and execution.
- Provide one concise recovery message when canvas data is unavailable.

## Outcome

Vault-document canvas actions share one localized presentation contract with the other left-rail menus.

## Notes

Sol approved the shared builder and actionable disabled reason with no findings. The focused suite passed 87 tests, and the complete frontend gate passed.
