---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S25'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate editor keybinding definitions and actionable disabled reasons

## Scope

- `frontend/src/stores/view/editorKeybindings.ts`
- `frontend/src/stores/view/editorKeybindings.render.test.tsx`
- `frontend/src/stores/view/commandPaletteCommands.ts`
- `frontend/src/stores/view/commandPaletteCommands.test.ts`
- `frontend/src/app/viewer/MarkdownDocView.tsx`
- `frontend/src/app/viewer/MarkdownDocView.render.test.tsx`
- `frontend/src/app/viewer/DocChrome.tsx`
- `frontend/src/app/viewer/DocChrome.render.test.tsx`
- `frontend/src/locales/en/common.ts`
- `frontend/src/locales/en/documents.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/messagePolicy.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/scripts/localization-allowlist.json`

## Description

- Replace editor shortcut labels, groups, and disabled reasons with typed localization descriptors.
- Share canonical document action builders across shortcuts, the document toolbar, shortcut tooltip, and command palette.
- Resolve user-facing copy only at React rendering boundaries while preserving action IDs and behavior.
- Replace touched fake-timer coverage with real editor-store transitions and localization runtime assertions.
- Remove thirteen obsolete localization exemptions without adding new ones.

## Outcome

Editor shortcuts and their related surfaces now use concise, actionable document language from the localization catalogs. Save availability covers every real editor state, shortcut identity is unchanged, and the scanner baseline decreased from 1,458 to 1,445 findings.

## Verification

- `just dev lint frontend`
- Six focused Vitest files, 52 tests
- Independent Sol review approved with no findings

## Notes

The first full frontend gate found one formatting-only issue in a touched command file. Formatting that file resolved the issue, and the complete gate then passed.
