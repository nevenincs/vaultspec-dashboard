---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S39'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Delete the client one-slot queue chip rendering and read queued state from the session snapshot's queued_turn_ids instead

## Scope

- `frontend/src/app/agent/Composer.tsx`
- `frontend/src/app/agent/Composer.render.test.tsx`
- `frontend/src/app/agent/Transcript.render.test.tsx`
- `frontend/src/stores/server/agent/index.ts`
- `frontend/src/stores/server/agent/wireTypes.ts`
- `frontend/src/stores/view/agentComposer.ts`
- `frontend/src/stores/view/agentComposer.test.ts`

## Description

- Deleted the client-side one-slot queue's chip rendering in `Composer.tsx`: a
  mid-run submit no longer stages a local "next turn queued" chip client-side.
- Adapted `queued_turn_ids` off the served session snapshot in
  `stores/server/agent/index.ts`/`wireTypes.ts`, so queue state is engine-promoted
  (server-authoritative) rather than client-held.
- Simplified `agentComposer.ts`'s mid-run submit path to rely on this served
  indicator instead of a local queue-slot flag.

## Outcome

A mid-run submit now enqueues server-side and the queued indicator reflects the
engine-promoted `queued_turn_ids` truth rather than a client-guessed single slot —
closing the stale-queue-UI class of bug the client-side queue chip was prone to.

## Notes

Landed at commit `26b63636a9` ("delete the client one-slot queue — served
queued_turn_ids indicator, engine-promoted dispatch; interrupt/mode/session-cancel
store layer"), shared groundwork with the held `S41`/`S43`/`S45` store-layer steps
(not ticked here, per the team lead's HOLD list). This record was authored during a
fill pass (bookkeeping only, no code changes by me).

Independently reverified: `git show 26b63636a9 --stat` matches; live rerun of
`Composer.render.test.tsx`'s `Composer mid-run behavior (D4/S39)` group — 2/2
passed (mid-run submit enqueues server-side; steer-through-input on a staged
interrupt) — `stores/view/agentComposer.test.ts` (12/12) and
`stores/server/agent/wireTypes.test.ts` (8/8) — 20/20 — and
`Transcript.render.test.tsx` — 14/14.

Flagged, not attributed to this step: `Composer.render.test.tsx`'s unrelated
`Composer slash commands > opens on "/" at column 0, filters, runs the selection,
and dismisses on Escape` test is red at HEAD. It predates this commit (introduced at
`7bd22f87ee`) and is untouched by the queue-deletion diff — a pre-existing defect in
a different feature area (slash commands), reported here for visibility, not part
of this step's scope or verification.
