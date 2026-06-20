---
tags:
  - '#exec'
  - '#dashboard-state-centralization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S41'
related:
  - "[[2026-06-17-dashboard-state-centralization-plan]]"
---

# Add browser integration coverage for date-range changes propagating from timeline to graph and panels

## Scope

- `frontend/src/app/timeline/Timeline.render.test.tsx`
- `frontend/src/app/timeline/RangeSelect.tsx`
- `frontend/src/app/timeline/Timeline.tsx`
- `frontend/src/stores/view/selection.ts`

## Description

- Added a happy-dom live-engine integration test that renders the timeline
  date-range writer (`RangeSelect`) with TanStack dashboard-state readers.
- The test shift-drags the timeline range selector and verifies the committed
  backend dashboard-state date range is observed by:
  - a graph-query variable projection through `dashboardGraphQueryVariables`;
  - a panel-style dashboard-state reader.
- Standardized the timeline range writer to send backend-valid `yyyy-mm-dd`
  dashboard dates rather than full ISO instants.
- Removed the last local node-selection mirror in `selectNode`; node selection is
  now only patched into canonical dashboard-state.
- Repaired the shared `Timeline.tsx` dot-layout integration enough for the
  existing renderer to typecheck without reverting concurrent work.

## Outcome

- Targeted integration test passed: `npx vitest run
  src/app/timeline/Timeline.render.test.tsx`.
- Frontend typecheck passed: `npm run typecheck`.
- Scoped ESLint passed for the touched files.
- Scoped Prettier check passed for the touched files.

## Notes

- Vitest emitted the existing Node deprecation warning about child-process shell
  args; the run exited 0.
