---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S221'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize rail sorting

## Scope

- `frontend/src/stores/view/railSort.ts`
- `frontend/src/stores/view/railSort.test.ts`
- `frontend/src/stores/view/leftRailKeybindings.ts`
- `frontend/src/app/left/BrowserRegion.tsx`
- `frontend/src/app/left/BrowserRegion.render.test.tsx`
- `frontend/src/locales/en/documents.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/messagePolicy.ts`
- `frontend/scripts/localization-allowlist.json`

## Description

- Separate the frozen seven-item sort identity order from typed presentation descriptors.
- Add complete localized option, action, and accessibility messages.
- Resolve sort presentation at action and React boundaries without message composition.
- Preserve persisted state, normalization, direction, reselection, reset, and callback behavior.
- Prove real localStorage persistence and same-node English, French, and Arabic rendering.
- Remove twelve obsolete localization exemptions.

## Outcome

Rail sorting now uses clear sentence-case catalog messages, including Workspace share in
place of internal corpus terminology. Raw identities and behavior remain unchanged. The
scanner decreased from 1,163 to 1,151 findings with no new exemptions.

## Notes

Terra passed 82 tests across seven files and the complete frontend lint recipe. Independent
Sol review passed 56 tests and approved the frozen default, real persistence coverage,
fail-closed behavior, and multilingual DOM identity with no remaining findings.
