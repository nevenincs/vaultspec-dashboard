---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S44'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Retain and adapt the time-travel driver on the one delta clock with keyframe plus diff

## Scope

- `frontend/src/app/timeline/timeTravel.ts`

## Description

- Audit `timeTravel.ts` against the scroll-strip supersession: the driver
  operates on absolute epoch-ms instants (the `mode.at` the playhead writes) and
  references no window or positioning, so it is already coordinate-model-agnostic.
- Re-affirm the header contract for the new model: keyframe-plus-diff replay on the
  ONE shared delta clock (no second clock), local DeltaLog replay when the range
  is loaded, re-keyframe on out-of-range jumps, and `timelineMode` bound to the
  scene seam unchanged.

## Outcome

The time-travel driver is retained verbatim in behavior under the new
representation: no logic change was needed because it never coupled to the
fit-to-window model. The one-delta-clock invariant and keyframe-plus-diff replay
are intact (`timeTravel.test.ts` asserts re-keyframe-then-local-replay with zero
extra fetches and re-keyframe on out-of-range jumps). Gate green scoped to the
file (eslint, prettier, tsc, vitest).

## Notes

This step is a documentation re-affirmation rather than a code adaptation: the
driver had no window/positioning coupling to migrate. The change is limited to the
header comment so the retention is explicit for review.
