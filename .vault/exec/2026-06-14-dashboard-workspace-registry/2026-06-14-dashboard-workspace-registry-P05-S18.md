---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S18'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

# Test the WorkspacePicker four honest states and the add-a-project validation refusal

## Scope

- `frontend/src/app/left/WorkspacePicker.render.test.tsx`

## Description

- Add a render test for the WorkspacePicker covering the four honest states: loading (a quiet line), error with a retry control on a genuine `/workspaces` failure, the single-root quiet header (the empty/single-project case), and the designed degraded banner with its reason when the structural tier is down.
- Add a multi-root case (driven by a patched-body transport that rewrites the live `/workspaces` shape) asserting the expandable picker, the launch-default marker, and a kept-but-degraded unreachable root with its reason.
- Add the add-a-project validation-refusal case driven by the mock's REAL PUT /session register validation 400-ing a `bad`-prefixed path, plus a valid-registration case that flips the header into a picker.

## Outcome

The picker's honest states and the add-refusal are proven through the real stores client transport with no component-internal doubles, mirroring the worktree-switcher render-test discipline. All eight render-test cases pass.

## Notes

The degradation, multi-root, and unreachable states are driven by real `tiers` blocks and live-shaped bodies fed through the same client path the app uses, so the picker's degradation reading is verified against the real wire shape, never a stub.
