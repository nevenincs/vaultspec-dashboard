---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S10'
related:
  - "[[2026-07-14-rag-job-dashboard-plan]]"
---

# Build the jobs table region - sortable columns, filter query, phase chips, row selection joining the log pane, truncation note

## Scope

- `frontend/src/app/panels/RagJobsTable.tsx`

## Description

## Outcome

## Notes

## Description

- Build the jobs table region over the pure derivations: capped filter query, phase facet toggles with counts, Newest/Longest sort with aria-pressed column marks, selectable rows joining the log pane, running-row progress + step, failed-row note, truncation bound note, designed loading/empty/offline states.

## Outcome

Green. Executed by the named Opus coder rag-regions-coder; verified independently.

## Notes

Jobs read widened to the engine clamp (50) so the table shows real history - the truncation note fires only when the machine total exceeds the served slice. Phase facet pills are a bespoke token-composed composite (kit FacetRow/Chip do not fit an interactive horizontal cluster).
