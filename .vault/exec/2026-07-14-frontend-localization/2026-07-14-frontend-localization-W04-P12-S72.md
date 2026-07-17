---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S72'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate timeline range and criterion tests through production catalogs

## Scope

- `frontend/src/app/timeline/TimelineRangeSelector.criterion.render.test.tsx`
- `frontend/src/app/timeline/timelineRangeMath.test.ts`

## Description

- Confirmed neither test file mocks or stubs the localization runtime.
- Ran both test files live against the production engine and catalogs; all cases pass.

## Outcome

The timeline range and criterion tests exercise production locale resources end to
end.

## Notes

Reconciliation pass (bookkeeping only, no code changes). This record retroactively
documents and ticks the plan step; verification was a live focused-test run, not a
fresh implementation. Note: `timelineRangeMath.ts` itself (not this step's own scope)
carries a genuine localization defect — a hardcoded English `SHORT_MONTHS` array used
for date-label formatting instead of a locale-aware `Intl` formatter — reported
separately under `W04.P12.S70`. The test suite passes because it exercises English
output, which is also the production default, so it does not catch that defect; this
step is purely about the test file's own mocking hygiene, which is clean.
