---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S12'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Give plan step rows a keyboard-operable checkbox inside the row focus zone, disabled off the present view, riding the tick mutation with visible in-flight state

## Scope

- `frontend/src/app/right/PlanStepTree.tsx`

## Description

- Added `TickProps` interface (`planNodeId`, `scope`, `blobHash`, `isTimeTravel`) and threaded it through `PhaseGroup`, `WaveGroup`, and `StepRow`.
- Extended `PlanStepTree` props with `planNodeId`, `scope`, and `isTimeTravel`; called `useNodeContent(planNodeId, scope)` unconditionally at the component root to keep hook order stable and supply `blobHash`.
- Added `usePlanStepTick` call plus `pendingDone` and `tickMessage` state to `StepRow`; all steps now register with the focus zone so the checkbox `<input>` is the one tab stop per composite (Class-B widget-intrinsic key).
- Replaced the bare `<button>` row with `<div>` + `<label>` (sr-only native checkbox + `StepCheckMark`) + `tabIndex={-1}` preview `<button>`; label carries the explaining `title` when `isTimeTravel=true`.
- Derived `effectiveDone` from `tick.isPending || pendingDone !== null`; set `checkboxDisabled = !canTick || tick.isPending` so the checkbox re-enables the moment the mutation HTTP round-trip settles, not on the slower file-watcher re-ingest.
- Wired `onChange` → `handleTick`: optimistically sets `pendingDone`, calls `tick.mutate`, drives `conflict`/`refused`/error messages via `setTickMessage`; `useEffect` clears `pendingDone` once `step.done === pendingDone` (deferred cleanup after plan-interior reconciles).
- Updated `StatusTab.tsx`: threaded `isTimeTravel` from `OpenPlansBody` through `PlanPill` to `PlanStepTree`.
- Added `useTransport` method to `AuthoringClient` (changed `baseFetch` from `private readonly` to `private`) to allow the render test's live-transport swap.
- Added `authoringClient.useTransport(liveTransport)` to `liveSetup.ts` so tick mutations in render tests hit the real engine.

## Outcome

All five tests in `PlanStepTree.render.test.tsx` pass (3 static + 1 live tick + 1 time-travel). Full frontend gate exit 0 (ESLint, prettier, tsc, px-scan, module-size, token-drift, figma:names).

## Review revisions (post-initial-implementation)

Code review verdict was WITHHELD on one HIGH and two LOWs; all resolved in-pass:

- HIGH keyboard-preview-stranded: the preview `<button tabIndex={-1}>` had no keyboard path after it left the tab ring. Fixed by wiring `onCrossNext` on `nav.rove()` (ArrowRight fires `selectDashboardNode` — same action as clicking the preview button), importing `FocusZoneItemOptions`, and updating the `StepNav` interface's `rove` signature to `(key: string, options?: FocusZoneItemOptions) => FocusZoneItemProps`. Also added an Enter key handler on the checkbox (`onKeyDown`) for a second keyboard activation path, matching the `PlanPill` cross-axis pattern in `StatusTab.tsx:194-201`.
- LOW-1 stale-conflict-linger: `useEffect` reconcile now also calls `setTickMessage(null)` alongside `setPendingDone(null)`, clearing conflict/refused alerts once the served state catches up.
- LOW-2 thin aria-label: enriched from `"toggle step S01"` to `"toggle step S01: <headingLabel>"`, giving assistive tech the human description in addition to the id.

## Notes

One pre-existing test failure in `internal.test.ts` ("enrolls every scoped query family") — `SCOPED_ENGINE_QUERY_SUBTREES` in the committed branch includes `"git-changes-summary"` but the test's `scopedKeys` list was never updated to add `engineKeys.gitChangesSummary`; introduced by parallel W02.P05 work, not by this step. Neither `internal.ts` nor `internal.test.ts` has uncommitted changes.
