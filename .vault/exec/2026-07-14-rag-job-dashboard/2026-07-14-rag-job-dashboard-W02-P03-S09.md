---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S09'
related:
  - "[[2026-07-14-rag-job-dashboard-plan]]"
---

# Build the dashboard shell and header bar mirroring the bound frame and mount it as the Search service panel body, retiring the re-hosted console composition

## Scope

- `frontend/src/app/panels/RagJobDashboard.tsx`

## Description

## Outcome

## Notes

## Description

- Build the dashboard shell + header bar mirroring the bound frame: identity + health dot/word, pid/port meta, lifecycle verbs with eligibility (Start when down, Stop/Restart when running, Doctor; disabled-with-reason reindex when offline), inline reindex progress.
- Swap the Search service panel body to the dashboard (Dialog wide, footer slot carries the storage strip); create compiling skeletons for the three region files per the cross-lane integration contract.
- Header bar exported as a pure props-fed sub-component so verb eligibility and offline states are wire-free testable; 7 unit tests + 1 live smoke.

## Outcome

Green. Executed by rag-shell-coder; verified independently.

## Notes

Lifecycle label map re-created locally (console helpers are unexported; console file deliberately untouched pending W03 retirement decision). Console body import dropped from ControlPanels.
