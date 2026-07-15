---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S223'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize vault-category menu actions while keeping localized category labels out of raw clipboard payloads

## Scope

- Vault-category descriptors, localized clipboard messages, outcome classification, catalogs, scanner allowlist, and behavior tests.

## Description

- Replace category menu strings with typed descriptors.
- Resolve localized category names only at the clipboard effect boundary.
- Fall back to generic document copy for unknown category types.
- Reject malformed clipboard payloads without exposing their contents.

## Outcome

Category actions use consistent terminology and never expose an unknown document-type token as user-facing copy.

## Notes

Sol approved the closed clipboard payload contract with no findings. The focused suite passed 87 tests, and the complete frontend gate passed.
