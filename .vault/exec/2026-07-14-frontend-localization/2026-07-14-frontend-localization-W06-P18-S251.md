---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S251'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Remove authored case transforms and enforce their absence

## Scope

- `frontend/src/app/kit/SectionLabel.tsx`
- `frontend/src/app/kit/SectionLabel.render.test.tsx`
- `frontend/src/app/menu/KeyboardShortcuts.render.test.tsx`
- `frontend/src/app/left/CreateDocDialog.tsx`
- `frontend/src/app/left/WorktreePicker.tsx`
- `frontend/src/app/panels/RagDashboardFooter.tsx`
- `frontend/src/app/panels/RagJobsTable.tsx`
- `frontend/src/app/right/menus/HoverCard.tsx`
- `frontend/src/app/shell/WorkspaceSwitcherSheet.tsx`
- `frontend/src/stores/server/queries/dashboard.ts`
- `frontend/src/styles.css`
- `frontend/src/three-lab/AppearancePanel.tsx`
- `frontend/src/three-lab/ThreeLab.tsx`
- `frontend/scripts/scan-localization.mjs`
- `frontend/scripts/scan-localization.test.ts`
- `frontend/scripts/fixtures/localization/`
- `frontend/scripts/localization-allowlist.json`

## Description

- Remove CSS, Tailwind, and inline case transforms while preserving typography and DOM behavior.
- Make SectionLabel render catalog casing exactly as authored.
- Add a zero-exception authored-case-transform scanner rule across production and auxiliary sources.
- Separate class-name expressions from generic JSX copy scanning.
- Remove stale comments and 222 obsolete class-name false-positive exemptions.

## Outcome

Frontend presentation can no longer manufacture uppercase, lowercase, title case, or small caps through authored styles. English, French, and Arabic catalog casing renders unchanged, while semantic runtime token-casing remains assigned to S132 owners.

## Verification

- `just dev lint frontend`
- Scanner tests, 14 tests
- Terra affected suite, 10 files and 110 tests
- Independent Sol suite, four files and 57 tests
- Independent Sol review approved with no findings

## Notes

The authored-case rule has zero findings and zero allowlist entries. Correct scanner ownership removed 222 stale JSX class-name findings without adding replacements, reducing the scanner from 1,406 to 1,184 findings.
