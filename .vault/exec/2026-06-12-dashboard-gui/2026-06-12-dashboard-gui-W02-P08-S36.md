---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S36'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement event-mark click selection with node-ids cross-highlight pulse on the stage per G2.b and the contract event shape

## Scope

- `frontend/src/app/timeline/eventSelection.ts`

## Description

- Add `frontend/src/app/timeline/eventSelection.ts`: clicking an event
  mark selects it through the one shared selection (event kind carrying
  its `node_ids` - the contract's load-bearing join field) and pulses the
  corresponding nodes on the stage.
- Add the `pulse` seam command (additive amendment, flagged): a transient
  cross-highlight borrowing the ego treatment for 1.2s, superseded by any
  newer pulse - the field implements it token-guarded.
- Wire the timeline surface's event-click handler in the shell; the S23
  selection binding additionally focuses the event's first carried node.
- Add `frontend/src/app/timeline/eventSelection.test.ts` covering
  selection shape, the pulse command with carried ids, and the
  no-node-no-pulse case.

## Outcome

Timeline and stage join on node ids both ways: marks click through to
selection and pulse; the inspector reads the same selection (S42). Phase
W02.P08 - and with it Wave W02 - is complete. Gates green: typecheck,
eslint, vitest (170 passed), prettier; production build passes.

## Notes

The `pulse` command is the third additive seam amendment (after meta and
command), flagged for experience-architect confirmation at the P08 review.

