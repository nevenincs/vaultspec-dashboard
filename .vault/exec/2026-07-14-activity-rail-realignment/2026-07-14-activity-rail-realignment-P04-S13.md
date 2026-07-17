---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S13'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

# Re-pin the rail guard tests and the status parity harness to the status-only composition and relocate the console and review-station tests beside their panels

## Scope

- `frontend/src/app/right/rail.test.ts`

## Description

## Outcome

## Notes

## Description

- Audit the suite for tests pinning the evicted rail composition: none existed (console/review tests exercise bodies standalone; the status parity harness mounts the already-clean StatusTab).
- Add the positive status-only guard to the rail suite: sections exactly Plans/Pull requests/Issues/Commits, retired ids normalize to null, CONTROL_PANEL_IDS is exactly the four cluster panels.

## Outcome

Green. Executed by rail-parity-coder; verified independently.

## Notes

No test relocation was needed - nothing was coupled to the old rail mounts.
