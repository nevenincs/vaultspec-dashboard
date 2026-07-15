---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S37'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize timeline date criteria

## Scope

- `frontend/src/app/timeline/timelineDateCriterion.ts`
- `frontend/src/app/timeline/timelineDateCriterion.test.ts`
- `frontend/src/app/timeline/TimelineRangeSelector.tsx`
- `frontend/src/app/timeline/TimelineRangeSelector.criterion.render.test.tsx`
- `frontend/src/app/timeline/menus/timelineFilterActions.ts`
- `frontend/src/app/menus/backgroundMenu.test.ts`
- `frontend/src/locales/en/timeline.ts`
- `frontend/src/locales/en/index.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/messagePolicy.ts`
- `frontend/scripts/localization-allowlist.json`

## Description

- Define frozen raw timeline criterion identities and a separate typed presentation map.
- Add exact nullable lookup and live-setting capability rules.
- Localize complete labels, filter actions, range guidance, accessibility text, and disabled reasons.
- Resolve catalog descriptors at menu and React presentation boundaries.
- Add real English, French, and Arabic contract and same-node render tests.
- Remove thirteen obsolete localization exemptions.

## Outcome

Timeline criteria now display Created, Edited, and Updated through catalog keys without
exposing backend, field, schema, or availability metadata. Raw identities, ordering,
defaults, action IDs, callbacks, code-mode behavior, and live capability gating remain
unchanged. The scanner decreased from 1,176 to 1,163 findings with no new exemptions.

## Notes

The complete frontend lint recipe passed. Terra's rollout suite and Sol's independent
review each passed 28 tests across five files. TypeScript, targeted ESLint, catalog policy,
the localization scanner, formatting, and diff checks passed with no open findings.
