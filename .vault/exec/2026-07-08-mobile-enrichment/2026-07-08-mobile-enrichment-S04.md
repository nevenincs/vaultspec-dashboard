---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-07-08-mobile-enrichment-plan]]"
---

# D4: edge-swipe back gesture in the compact reader (widget-intrinsic) routing the same doc-scoped unsaved-draft guard as tap-back

## Scope

- `frontend/src/app/shell/CompactDocReader.tsx`

## Description

- Add `useEdgeSwipeBack` inside `CompactDocReader`: a leading-edge start band, a vertical-scroll-intent yield, and a commit threshold, applied to both reader panes.
- Route both tap-back and the swipe through `guardUnsavedDiscardForDoc` so a dirty draft for this document arms the discard confirm before the reader pops.

## Outcome

An edge-swipe pops the reader with the SAME guarded close as the tap-back control. Touch/pen only; a mouse keeps the tap control.

## Notes

Hardening decided in ADR D7: pointer capture is REJECTED (it would starve the reader's
own scroll child of pointer events); the gesture ships with `touch-action: pan-y` +
the vertical-intent yield in the move handler, which is the committed form.

The real-device gap the vitest suite cannot exercise is closed for merge by this manual
verification checklist (run on iOS Safari + Android Chrome before a mobile release):

- [ ] A leading-edge horizontal swipe pops the open reader back to Browse.
- [ ] A vertical scroll inside the reader body does NOT trigger back.
- [ ] A diagonal drag yields to scroll (never a partial back-slide).
- [ ] With a dirty editor draft, the swipe arms the discard confirm (parity with tap-back).
- [ ] The OS left-edge back-gesture (iOS) and the app edge-swipe do not double-fire.
