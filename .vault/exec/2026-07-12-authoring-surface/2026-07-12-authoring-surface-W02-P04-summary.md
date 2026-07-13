---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# `authoring-surface` `W02.P04` summary

Phase W02.P04 delivered the plan-step interactive checkbox (S12) and its live-engine render test (S13). 2 steps checked.

Modified files:
- `frontend/src/stores/server/authoring.ts` (added `useTransport` method; `baseFetch` no longer `readonly`)
- `frontend/src/testing/liveSetup.ts` (patches `authoringClient.useTransport(liveTransport)`)
- `frontend/src/app/right/PlanStepTree.tsx` (full checkbox implementation: `TickProps`, `StepRow` with `usePlanStepTick`, optimistic `pendingDone`, `effectiveDone`, focus-zone integration, `isTimeTravel` disable)
- `frontend/src/app/right/StatusTab.tsx` (threaded `isTimeTravel` through `PlanPill` to `PlanStepTree`)
- `frontend/src/app/right/PlanStepTree.render.test.tsx` (static `renderPure` helper; live tick + time-travel tests)

## Description

W02.P04 added the keyboard-operable plan-step checkbox to the status-rail tree (authoring-surface ADR D1). Each step row now carries a native `<input type="checkbox">` (sr-only, focus-zone tab stop) paired with the `StepCheckMark` visual proxy. The checkbox fires `usePlanStepTick` on change, renders optimistic checked state while the mutation is in flight via `pendingDone`, re-enables as soon as the HTTP round-trip settles (`tick.isPending` → false), and disables entirely when `isTimeTravel=true` with an explaining `title` attribute. Inline `role="alert"` messages surface conflict/refused/error outcomes in sentence case.

The render test wires an actor token through the module-level `setActorToken` / `requireActorToken` seam (parallel to `comments.live.test.ts`), ticks S02 via `fireEvent.click`, asserts in-flight state (checked + disabled), then waits for `disabled=false` within ENGINE_WAIT. The restore block in `finally` calls `authoringClient.directWrite` directly to return the fixture to canonical state. A time-travel test asserts that all checkboxes are permanently disabled with the explaining label title.

Full frontend gate exit 0. 5/5 tests pass.
