---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S13'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Render test: tick a fixture step, assert served done-state reconciliation and the time-travel disable

## Scope

- `frontend/src/app/right/PlanStepTree.render.test.tsx`

## Description

- Added `renderPure` helper (wraps `PlanStepTree` in `QueryClientProvider`) to all static tests — required because `PlanStepTree` now calls `useNodeContent` unconditionally at its root.
- Added `afterEach(() => queryClient.clear())` to the static describe block to prevent cache pollution between static and live suites.
- Added `LivePlanStepTree` component and `renderLivePlanStepTree` helper that mount the tree against the real engine via the fixture plan (`doc:2026-01-03-alpha-plan`).
- Added `beforeAll`: resolves the live scope, issues an actor token via `authoringClient.issueActorToken`, calls `setActorToken` to bootstrap `requireActorToken` for the in-component tick mutation.
- Added live tick test: waits for S01 checked + S02 unchecked + S02 enabled (blob_hash loaded); fires `fireEvent.click(s02)`; asserts in-flight state (checked + disabled); then waits within ENGINE_WAIT for `s02.disabled = false` (mutation HTTP round-trip settled); restores S02 to unchecked via `authoringClient.directWrite` in the `finally` block.
- Added time-travel test: renders with `isTimeTravel=true`, waits for S02 checkbox, asserts `disabled=true` and label `title` contains `"viewing history"`.

## Outcome

All six tests pass: 3 static + 1 live tick (1569ms, well within ENGINE_WAIT budget) + 1 time-travel + 1 keyboard-preview (ArrowRight / Enter). Full frontend gate exit 0.

## Review revision (post-initial-implementation)

Code review also required a keyboard-preview test. Added as the second live test:

- Waits for S01's selectable preview button (`"step S01, open exec record"`) to confirm the fixture exec record is served.
- Fires `fireEvent.keyDown(s01, { key: "ArrowRight" })` on the S01 checkbox.
- Polls `queryClient.getQueriesData({ queryKey: engineKeys.all, exact: false })` until a dashboardState entry with `selected_ids` containing `"doc:2026-01-03-alpha-S01"` appears — the same cache-path `updateDashboardStateCache` writes on every `patchDashboardState` call.
- Updated all `getByRole("checkbox", { name: "..." })` exact-string queries to regex (`{ name: /toggle step S01/ }`) to match the enriched aria-label that now includes heading text.

## Notes

The reconciliation condition ("checkbox re-enabled") is bounded by the mutation HTTP round-trip, not the engine file-watcher re-ingest. The watcher re-ingest can take > 12 seconds in the scratch-vault test environment; `checkboxDisabled` was therefore decoupled from `pendingDone !== null` (which tracks watcher lag) and bound only to `tick.isPending` (HTTP in-flight). `pendingDone` still drives `effectiveDone` so the visual "ticked" state persists until the plan-interior query reconciles asynchronously.
