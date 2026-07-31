---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-17'
body_hash: 'sha256:1f11d334fd74b5d7e2535e38be5a67a8929320cd2ffc9bd911053af4c3b986cf'
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
