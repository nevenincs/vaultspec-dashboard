---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S33'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement the playhead with LIVE docking and unmistakable time-travel mode entry and exit per G4.b

## Scope

- `frontend/src/app/timeline/Playhead.tsx`

## Description

- Add `frontend/src/app/timeline/Playhead.tsx`: the draggable playhead
  over the timeline surface, LIVE-docked at the right edge by default;
  drag resolves through the pure, tested `dragToPlayhead` (clamped to the
  window and never past now; an edge band snaps back to LIVE).
- One mutation owns the mode: `movePlayhead` updates the timeline store
  and flips the shared `timelineMode` together - the playhead IS the mode,
  so the ops surface (S41) and the tier dial's semantic inapplicability
  (S29) react from the same state.
- Make entry and exit unmistakable per G4.b: the playhead changes colour
  off LIVE, the LIVE label becomes a "return to live" action, and the
  `TimeTravelChip` ("viewing {date} - return to live") docks on the stage
  while time travelling.
- Add `frontend/src/app/timeline/Playhead.test.ts` covering LIVE snap,
  clamped mapping, never-past-now, and mode entry/exit round-trip.

## Outcome

Scrubbing off LIVE puts the product into explicit time-travel mode and
returning docks back; the stage's temporal state follows in S34. Gates
green: typecheck, eslint, vitest (161 passed), prettier.

## Notes

The stage tint shift ("paper ages slightly") belongs to the S47 token
layer; the chip and playhead colour carry the unmistakability until then.

