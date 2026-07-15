---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S11'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Render the schema-owned language control through localized setting metadata

## Scope

- `frontend/src/locales/en/settings.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/src/stores/view/settingsPresentation.ts`
- `frontend/src/stores/view/settingsControls.ts`
- `frontend/src/app/settings/SettingsDialog.tsx`
- `frontend/src/app/settings/controls`

## Description

- Add exhaustive typed descriptors for every admitted settings group, field, and enum member.
- Resolve settings metadata at the React boundary through the localization runtime.
- Remove enum token title-casing and raw presentation fallbacks.
- Pass localized labels and placeholders to every dialog control and accessibility name.
- Add genuine English, French, and Arabic settings resources.
- Suppress unknown, incomplete, or malformed presentation safely.

## Outcome

The schema-owned settings dialog now renders localized presentation without storing
resolved strings or exposing semantic identities. Language appears as a real segmented
setting with localized System and English choices. Labels use concise concepts such as
Default detail level, Graph content, Minimum connection certainty, and Name filter.

## Notes

Independent Terra review passed after direct Language-control coverage and clearer French
and Arabic wording were added. Sixty-eight integrated settings and localization tests plus
eleven focused review tests passed. TypeScript, targeted ESLint, Prettier, message policy,
localization scanning, and diff checks passed. The scanner remained clean at 1,151
findings with no allowlist change. Dialog chrome and write-feedback copy remain assigned
to their later plan steps.
