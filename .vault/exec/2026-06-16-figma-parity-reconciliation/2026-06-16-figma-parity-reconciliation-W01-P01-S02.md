---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S02'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Author the DTCG radius source with the Figma scale xs4, sm5, md7, lg10, and pill18

## Scope

- `frontend/tokens/radius.tokens.json`

## Description

- Authored a new DTCG radius source under the tokens directory carrying the binding Figma radius scale: xs at 4px, sm at 5px, md at 7px, lg at 10px, and pill at 18px.
- Each step is a dimension token in rem with a description naming its binding role (chips, controls, panels, dialogs, pill shapes).
- Recorded that pill is new (the prior code used a native fully-rounded utility) and that these emit as the canonical radius foundation tokens with the legacy names kept as deprecated aliases until the view rewrite.

## Outcome

The radius taxonomy is authored as DTCG faithful to the binding Figma scale, replacing the prior sm4/md6/lg10/xl14 set. md is now 7px (was 6px) and the new pill 18px is available for the rounded-full re-key in the view rewrite. Consumed by the generator and Figma mirror extensions.

## Notes

The prior xl 14px radius has no exact Figma counterpart; the nearest binding step is lg 10px, so the legacy xl alias resolves there during the alias window (recorded in the alias block, S09).
