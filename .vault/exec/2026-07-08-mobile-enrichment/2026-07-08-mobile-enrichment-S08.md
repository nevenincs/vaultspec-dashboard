---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
step_id: 'S08'
related:
  - "[[2026-07-08-mobile-enrichment-plan]]"
---




# D7: edge-swipe hardening decided — pointer-capture rejected, touch-action pan-y shipped

## Scope

- `real-device gap closed via a documented manual-verify checklist on the S04 record`
- `frontend/src/app/shell/CompactDocReader.tsx`

## Description

- Decide the edge-swipe hardening (ADR D7): REJECT `setPointerCapture` (it would starve the reader's own scroll child of pointer events); keep the shipped `touch-action: pan-y` plus the vertical-intent yield in the move handler.
- Record the real-device manual-verification checklist on the S04 execution record to formally close the gate the vitest suite cannot exercise.

## Outcome

The D4 gesture ships in its committed form; the real-device verification gap is closed for merge by a documented manual checklist (iOS Safari + Android Chrome). No code change beyond the already-shipped hardening.

## Notes

