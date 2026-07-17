---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S29'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize command family headings

## Scope

- `frontend/src/stores/view/commandPaletteCommands.ts`
- `frontend/src/stores/view/commandPaletteCommands.test.ts`
- `frontend/src/stores/view/commandPaletteFamilies.localization.test.ts`
- `frontend/src/app/palette/CommandPalette.tsx`
- `frontend/src/app/palette/CommandPalette.render.test.tsx`
- `frontend/src/locales/en/common.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/messagePolicy.ts`
- `frontend/src/localization/testing/resources.ts`

## Description

- Replace raw command-family display tokens with an exhaustive typed descriptor map.
- Carry descriptors through the store and resolve headings only during React render.
- Remove forced uppercase styling so catalog sentence case renders as authored.
- Fail closed by omitting an unresolved heading without hiding its usable command rows.

## Outcome

Command family headings now use clear user concepts such as Workspace maintenance, Search maintenance, Layout, and Refresh. Stable family tokens continue to control grouping and identity but can no longer appear as fallback UI.

## Verification

- `just dev lint frontend`
- Five focused Vitest files, 46 tests
- Independent Sol review approved with no findings

## Notes

The scanner remains at 1,422 findings because the former lowercase family tokens were a scanner blind spot. A first test approach mutated resource bundles to exercise fallback and was replaced with a non-mutating production-helper proof.
