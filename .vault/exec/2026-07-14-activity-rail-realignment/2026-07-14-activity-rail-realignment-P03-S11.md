---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S11'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

# Evict the Search service and Approvals SectionCards from the rail and retire the rag-ops, rag-ops:details, and authoring-review section ids

## Scope

- `frontend/src/app/right/StatusTab.tsx`

## Description

## Outcome

## Notes

## Description

- Delete the Search service and Approvals SectionCards and imports from `StatusTab`; retire `rag-ops` and `authoring-review` from the StatusSectionId union and STATUS_SECTION_IDS (keep `rag-ops:details`).

## Outcome

Rail is status-only; rail.test.ts needed no changes (it never pinned the evicted sections). Executed by rail-chrome-coder; verified independently.

## Notes

Persisted open-state for the retired ids drops on rehydrate via the existing normalizer - no migration shim, per the ADR.
