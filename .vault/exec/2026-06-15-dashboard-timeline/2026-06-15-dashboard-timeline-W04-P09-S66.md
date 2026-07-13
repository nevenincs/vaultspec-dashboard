---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S66'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Swap scrub, range-play, and bundle animation for instant state changes under prefers-reduced-motion

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Verified prefers-reduced-motion makes the surface behavioural animation instant: a reactive reduced-motion hook (subscribed to the media-query list, reading through the shared helper) drops the mark color/opacity transition utility so ego-highlight opacity is a cut not a tween; range-play swaps the animated sweep for an instant jump to the range end; bundling is a static path choice (no morph) by construction.

## Outcome

Under reduced motion the scrub/range-play/bundle changes are instant; reuses the project prefers-reduced-motion convention. Satisfied by the prior partial run; assessed and confirmed.

## Notes

Source satisfied by the prior partial run, reusing the established reduced-motion helper. This run confirmed the S66 render tests (reduced-motion drops the mark transition class; the motion-allowed control keeps it).
