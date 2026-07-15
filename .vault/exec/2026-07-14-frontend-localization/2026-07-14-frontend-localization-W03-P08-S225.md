---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S225'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize vault-feature menu actions through shared action and raw clipboard boundaries

## Scope

- Vault-feature descriptors, shared canvas and clipboard actions, catalogs, scanner allowlist, and behavior tests.

## Description

- Replace feature menu strings with typed descriptors.
- Reuse the shared canvas action and canonical Filter by wording.
- Keep copied feature tags as untranslated user data.
- Prove English, French, and Arabic resolution.

## Outcome

Feature actions resolve through catalogs while feature tags remain byte-for-byte user data at the clipboard boundary.

## Notes

Sol approved the final action grammar and behavior preservation with no findings. The focused suite passed 87 tests, and the complete frontend gate passed.
