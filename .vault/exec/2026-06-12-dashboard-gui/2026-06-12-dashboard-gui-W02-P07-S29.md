---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-07-12'
step_id: 'S29'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# build the tier dial control with per-tier toggles and confidence thresholds, semantic rendered inapplicable in time-travel, per G3.f and G4.b

## Scope

- `frontend/src/app/stage/TierDial.tsx`

## Description

- Add `frontend/src/app/stage/TierDial.tsx`: the signature trust dial -
  the four tiers in the fixed product order with their marks, per-tier
  switch buttons, and confidence-floor sliders for the temporal and
  semantic tiers (the R3 floats).
- Render semantic INAPPLICABLE in time-travel mode per G4.b - disabled,
  dashed, with a tooltip stating the design ("semantic is about now") -
  via the pure, tested `isTierInapplicable`.
- Accessibility: switch roles, aria labels, keyboard-operable buttons and
  range inputs.

## Outcome

The dial drives the S28 filter store directly; the stage fades what each
toggle removes. Tests ride the S30 commit (one bar test file covers dial
order, inapplicability, and the cost chip). Gates green at the S30
boundary.

## Notes

Dial state is choice state only; whether semantic is AVAILABLE (rag down)
is the degradation matrix's surface (S46) and renders on the dial then.
