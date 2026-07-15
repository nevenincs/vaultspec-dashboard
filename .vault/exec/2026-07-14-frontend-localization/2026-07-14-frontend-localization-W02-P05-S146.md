---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S146'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate the refresh-data producer

## Scope

- `frontend/src/stores/view/reloadKeybindings.ts`
- `frontend/src/stores/view/commandProviders/reloadCommandProvider.ts`
- `frontend/src/stores/view/commandProviders/reloadCommandProvider.test.ts`
- `frontend/src/stores/view/commandPalette.localization.test.ts`
- `frontend/src/app/menus/globalTail.test.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/scripts/localization-allowlist.json`

## Description

- Share one frozen refresh-data descriptor across action and keybinding producers.
- Preserve descriptor identity through palette provider and global menu composition.
- Add genuine French and Arabic refresh-data copy while keeping page reload separate.
- Remove two obsolete localization exemptions.

## Outcome

Menu, palette, and shortcut producers now share the same localized Refresh data action without changing its ID, chord, icon, grouping, availability, or refresh behavior.

## Verification

- `just dev lint frontend`
- Terra focused suite, five files and 17 tests
- Independent Sol review approved with no findings

## Notes

The context-independent provider became zero-argument so the touched test no longer required a synthetic command context. The scanner decreased from 1,408 to 1,406 findings.
