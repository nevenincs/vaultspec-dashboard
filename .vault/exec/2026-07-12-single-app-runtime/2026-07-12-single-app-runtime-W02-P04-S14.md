---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S14'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Render the SPA first-run onboarding empty state that registers the first workspace by validated path entry through the workspace-registry write seam, then warms and selects it like a launch root

## Scope

- `frontend/src/app/onboarding/`

## Description

- Create `frontend/src/app/onboarding/FirstRunOnboarding.tsx`: pure resolver (`resolveFirstRunOnboardingState` — the empty served workspace registry is the ONLY signal; pending/error stay hidden so there is never a false first-run flash), one memoized hook over `useWorkspaces`, a dumb presentation body, and the wired surface.
- Branch `AppShell` to the onboarding surface when the signal holds (whole-shell takeover, mirroring the compact/desktop split), mounting `AddProjectDialog` and firing the EXISTING shared `project:open` action — no bespoke registration handler.
- Add wire-free unit tests (6) mirroring the `ProvisionPanel` resolver/body split.

## Outcome

Registration through the existing `useAddWorkspace` seam warms and selects the new root; the refetched registry clears the signal and the normal shell takes over without a reload. 6/6 tests green; full frontend lint components green.

## Notes

Executed by a delegated frontend coder; the coder's channel went silent after finishing, so the work was verified and committed by the orchestrator (tests re-run inline, lint gate re-run inline).
