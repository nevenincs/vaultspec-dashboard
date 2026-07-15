---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S250'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Remove the temporary keybinding presentation bridge and retain scanner enforcement for raw keybinding fields

## Scope

- Keybinding registry, shortcut and settings consumers, scanner rules and fixtures, exact allowlist, and focused tests.

## Description

- Make keybinding labels and groups descriptor-only.
- Remove the legacy type, helper, normalizer, and string consumer branches.
- Omit malformed raw label or group definitions from user-facing projections.
- Replace helper-specific scanner detection with raw keybinding field enforcement.
- Preserve IDs, chords, contexts, order, overrides, callbacks, and stable row identity.

## Outcome

The keybinding localization bridge is gone from production and tests. Raw label and group fields remain prohibited by the scanner, and malformed definitions fail closed without exposing their contents.

## Notes

Sol expanded closure proof to three residual consumers and approved the final descriptor-only contract with no findings. The scanner has no legacy-keybinding category. The focused suite and complete frontend gate passed.
