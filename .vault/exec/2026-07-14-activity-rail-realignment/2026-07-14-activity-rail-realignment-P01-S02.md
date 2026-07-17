---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S02'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

# Design the Search service and Approvals panel frames as modal dialogs re-hosting the existing console layouts, replacing the stale search-console binding

## Scope

- `Figma SlhonORmySdoSMTQgDWw3w SearchServicePanel ApprovalsPanel`

## Description

## Outcome

## Notes

## Description

- Create `SearchServicePanel` (1089:4344): 480-wide modal shell (chrome/paper-raised, radius 10, Elevation/Popover shadow), Title/15 title row with quiet close mark, body = clone of the existing `RagOpsConsole` frame content stretched to fill - the console layout re-hosts unchanged.
- Create `ApprovalsPanel` (1089:4437): same shell; review queue of bordered proposal rows, each with title, kit Badge (Waiting / Claimed), meta line, and kit Button instances Approve (Secondary) / Reject (Ghost).

## Outcome

Both panels are bound frames replacing the rail-section presentation; the stale RagOpsConsole rail binding (879:4125) is superseded by the panel frame for the code join.

## Notes

No ReviewStation frame existed in Figma; the Approvals queue is a fresh Kit composition.
