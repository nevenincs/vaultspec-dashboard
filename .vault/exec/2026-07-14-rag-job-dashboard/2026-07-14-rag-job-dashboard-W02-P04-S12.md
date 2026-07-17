---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S12'
related:
  - "[[2026-07-14-rag-job-dashboard-plan]]"
---

# Build the footer storage strip - storage rollup with lower-bound honesty, watcher state and toggle, refresh

## Scope

- `frontend/src/app/panels/RagDashboardFooter.tsx`

## Description

## Outcome

## Notes

## Description

- Build the footer storage strip: Entries / On disk / Projects (live-orphaned split) stat cells from the storage rollup, surveyed-slice lower-bound note when truncated, kit Switch watcher toggle through the existing seams (disabled-with-reason offline), Refresh invalidating the dashboard reads.

## Outcome

Green. Executed by rag-regions-coder; verified independently.

## Notes

Renders inside the Dialog pinned footer slot per the shell integration contract.
