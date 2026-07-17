---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S35'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize browser mode vocabulary

## Scope

- `frontend/src/stores/view/browserMode.ts`
- `frontend/src/stores/view/browserMode.test.ts`
- `frontend/src/stores/view/leftRailKeybindings.ts`
- `frontend/src/stores/view/leftRailKeybindings.localization.test.ts`
- `frontend/src/stores/view/commandPaletteCommands.ts`
- `frontend/src/app/left/BrowserModeToggle.tsx`
- `frontend/src/app/left/BrowserModeToggle.render.test.tsx`
- `frontend/src/app/shell/IconRail.tsx`
- `frontend/src/app/shell/IconRail.render.test.tsx`
- `frontend/src/locales/en/documents.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/messagePolicy.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/scripts/localization-allowlist.json`

## Description

- Map internal browser modes to typed Documents and Files presentations.
- Add complete Browse documents and Browse files action messages.
- Resolve labels only at React boundaries while preserving raw IDs for identity and behavior.
- Reject unknown presentation and action modes without synthesis or fallback tokens.
- Remove three obsolete localization exemptions.

## Outcome

The frontend no longer exposes the internal `vault` or `code` browser-mode vocabulary. Mode selection, cycling, persistence, command IDs, and callbacks remain unchanged while English, French, and Arabic presentation resolves from catalogs.

## Verification

- `just dev lint frontend`
- Terra focused suite, seven files and 55 tests
- Independent Sol suites, 55 tests total
- Independent Sol review approved with no findings

## Notes

The separate IconRail navigation label and sort/reset action bridges remain assigned to their own steps. The scanner decreased from 1,184 to 1,181 findings.
