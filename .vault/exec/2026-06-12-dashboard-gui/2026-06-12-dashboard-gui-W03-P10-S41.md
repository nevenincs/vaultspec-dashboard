---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S41'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# build the ops surface with confirmation flows over the whitelisted ops proxy verbs, disabled in time-travel mode per G4.b

## Scope

- `frontend/src/app/right/OpsPanel.tsx`

## Description

- Add `frontend/src/app/right/OpsPanel.tsx`: the deliberately modest
  pillar-2 control surface - buttons-with-confirmation (two-click
  confirm/cancel, never an immediate fire) over the contract R1 whitelist
  verbatim: core vault check/stats, rag service lifecycle, reindex,
  watcher tuning. The whitelist is an exported, tested constant - never
  grown GUI-side.
- All verbs disable in time-travel mode per G4.b with an explanatory line;
  verb results report inline and invalidate the status snapshot.

## Outcome

The operational verbs exist where the activity is shown, gated exactly as
the ADR demands. Gates green: typecheck, eslint, vitest (184 passed),
prettier.

## Notes

Verb result envelopes pass through verbatim from the proxy (no engine
semantics added); richer envelope rendering can ride the inspector later
if operators need it.

