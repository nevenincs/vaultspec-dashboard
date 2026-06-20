---
tags:
  - '#exec'
  - '#dashboard-state-centralization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S43'
related:
  - "[[2026-06-17-dashboard-state-centralization-plan]]"
---

# Add request-count coverage proving filter and lens changes do not issue duplicate graph queries for availability

## Scope

- `frontend/src/stores/server/queries.test.ts`

## Description

- Added live-engine hook coverage for `useGraphSlice` plus
  `useGraphSliceAvailability`.
- Wrapped the app-wide `engineClient` transport with a recording pass-through
  that delegates every request to `liveTransport` while counting `/graph/query`
  calls.
- Verified the initial graph read, a filter change, and a lens change issue
  exactly one graph request each. Availability is read from the held graph query
  result and does not mint a duplicate request.

## Outcome

- Targeted query test passed: `npx vitest run src/stores/server/queries.test.ts`.
- Result: 1 test file, 58 tests passed, 0 failed.
- Frontend typecheck passed: `npm run typecheck`.
- Scoped ESLint and Prettier checks passed for `queries.test.ts`.

## Notes

- The request counter is not a fake transport: it records and forwards to the
  live engine transport for every request.
- Vitest emitted the existing Node deprecation warning about child-process shell
  args; the run exited 0.
