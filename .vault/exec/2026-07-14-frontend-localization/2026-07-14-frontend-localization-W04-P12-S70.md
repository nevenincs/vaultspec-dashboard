---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S70'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Replace manual month names and fixed date layouts with locale-aware temporal formatters

## Scope

- `frontend/src/app/timeline/timelineRangeMath.ts`
- `frontend/src/stores/view/timeline.ts`

## Description

- Investigated the reported hardcoded `SHORT_MONTHS` array and the
  `dateLabel`/`dayMonth`/`monthTicks` functions built on it. Confirmed via
  `grep -rln "dateLabel|dayMonth|monthTicks|SHORT_MONTHS"` across the frontend
  tree that none of the four were imported anywhere except their own test file —
  `TimelineRangeSelector.tsx` imports only the positioning helpers
  (`clampToSpan`/`spanRatio`/`msAtRatio`/`nextRangeForHandle`/`dayISO`/`parseISO`),
  none of the month-label functions.
- Confirmed the LIVE timeline date-label path (`stores/view/timeline.ts:648`)
  already calls the locale-aware `formatDate(locale, ms, { month: "short", ... })`
  from `platform/localization/formatters.ts` — the localization intent this step
  names ("no manual month names ... locale-aware temporal formatters") is already
  met by the code that actually renders.
- The coding lane (opus-l10n) removed the four dead exports (`SHORT_MONTHS`,
  `dateLabel`, `dayMonth`, `monthTicks`) from `timelineRangeMath.ts` rather than
  localizing dead code, keeping `dayISO`/`parseISO` (still live — the engine's
  `date_range` wire form). Updated `timelineRangeMath.test.ts` to drop the
  `dateLabel`/`monthTicks` test cases and keep the `dayISO` coverage.

## Outcome

`timelineRangeMath.ts` carries no unlocalized copy (nor any dead code); the live
timeline date-label path was already locale-aware before this step, via
`stores/view/timeline.ts`'s existing `formatDate` call.

## Notes

DIVERGENCE FROM THE PLAN STEP'S LITERAL FRAMING, flagged for the wave review: the
step's title implies localizing `timelineRangeMath.ts`'s month-name helpers
in place; what actually happened is those helpers were DEAD CODE (superseded by
the live `formatDate` path) and were deleted rather than localized. The
localization goal is met either way — the shipped app never rendered the
hardcoded `SHORT_MONTHS` array — but if the review specifically wants those
helpers kept-and-localized (e.g. for a future non-live consumer), this is a
one-commit revert away; opus-l10n flagged the same in its own report.
Independently reran `timelineRangeMath.test.ts` live (8/8 passed, part of the
78-test batch total) and confirmed the zero-reference grep myself. Landed at
commit `578b4e5454` ("batch #2 test-only stale assertions to typed/sentence-case
output + remove dead English-month helpers ... dual-verified"). Not a fresh
implementation on my part.
