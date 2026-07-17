---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S02'
related:
  - "[[2026-07-14-rag-job-dashboard-plan]]"
---

# Design the job table frames - column header row with sort marks, row states (queued, running with progress, done, failed), the filter query field, and the phase facet chips

## Scope

- `Figma SlhonORmySdoSMTQgDWw3w RagJobDashboard jobs region`

## Description

## Outcome

## Notes

## Description

- Fill the JobsRegion: JOBS eyebrow, controls row (SearchField filter query, All/Running/Queued/Done/Failed chips, sort control), bordered table header (Job/Phase/Progress/Started/Duration with sort mark), four row states (running with progress bar, queued, done, failed with reason note), and the "Showing the 50 most recent jobs" truncation note.

## Outcome

Jobs region bound; row states legible in grayscale (dot + word, never hue alone).

## Notes

Minor row-height unevenness on rows with empty progress cells - cosmetic in the frame; code rows derive their own uniform height.
