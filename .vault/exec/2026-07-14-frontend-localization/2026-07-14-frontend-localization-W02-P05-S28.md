---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S28'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize palette shortcut presentations

## Scope

- `frontend/src/stores/view/commandPalette.ts`
- `frontend/src/stores/view/commandPalette.localization.test.ts`
- `frontend/src/stores/view/keyboardShortcuts.ts`
- `frontend/src/stores/view/keyboardShortcuts.test.ts`
- `frontend/src/stores/view/reloadKeybindings.ts`
- `frontend/src/locales/en/common.ts`
- `frontend/src/locales/en/documents.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/messagePolicy.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/scripts/localization-allowlist.json`

## Description

- Replace command, global search, and document search shortcut presentations with typed descriptors.
- Reuse the same canonical descriptors in matching action resolvers.
- Converge every General shortcut producer on one semantic group key.
- Remove nine obsolete localization exemptions without adding new ones.

## Outcome

Palette shortcuts now use concise catalog-owned language and preserve all mode-specific toggle behavior. The shortcut legend renders one General group across palette, shortcut-dialog, and reload producers. The scanner baseline decreased from 1,431 to 1,422 findings.

## Verification

- `just dev lint frontend`
- Seven focused Vitest files, 48 tests
- Independent Sol review approved with no findings

## Notes

Search result, empty-state, live-region, command-family, and operation feedback copy remains assigned to its dedicated steps.
