---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S03'
related:
  - "[[2026-07-14-rag-job-dashboard-plan]]"
---

# Design the log pane frames (monospace rows with level tones, lines selector, job-filter chip, empty and offline states) and the footer storage strip (points, footprint, tenant counts with live and orphaned split, truncation note, watcher toggle)

## Scope

- `Figma SlhonORmySdoSMTQgDWw3w RagJobDashboard log and footer`

## Description

## Outcome

## Notes

## Description

- Fill the LogRegion: controls row (filter field, active "Job: reindex vault" join chip, lines selector), sunken mono well (JetBrains Mono rows with INFO/WARN/ERROR level tones via status hues), and the fetched-window honesty caption.
- Fill the FooterBar: Entries / On disk / Projects (live-stale split) stat cells, the surveyed-slice bound note, the Watcher switch, and Refresh.

## Outcome

Log and footer frames bound; plain-language labels throughout (no service-internal vocabulary).

## Notes

Mono family: JetBrains Mono available in the environment; code side uses the font-mono token stack regardless.
