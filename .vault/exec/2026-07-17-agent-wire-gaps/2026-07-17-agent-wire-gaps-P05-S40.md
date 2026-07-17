---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S40'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Render transcript Done and Failed terminal states from run.completed instead of the relay-gap seam placeholder

## Scope

- `frontend/src/app/agent/Transcript.tsx` (actual site of the mechanism; a
  letter-vs-mechanism divergence from the plan's named scope, see Notes)
- `frontend/src/stores/view/agentTranscript.ts` (plan's named scope, read and
  confirmed to carry no terminal-status placeholder)

## Description

- Confirmed by reading: `Transcript.tsx`'s `RUN_STATUS_MESSAGE` map already renders
  every served `RunStatus` terminal token honestly — `completed` → Done, `cancelled`
  → Stopped, `failed` → Failed — consumed by `TurnStatusLine` per turn.
- Confirmed `run.completed`'s terminal-aware invalidation (landed at `506daa04a2`,
  the same commit S37 built on) is what lands the settled snapshot carrying that
  served status, closing the loop end to end.
- Confirmed `stores/view/agentTranscript.ts` (this step's named scope file) holds
  none of this: it is the client-held tool-call/thinking annex only, and contains no
  run-status rendering or relay-gap placeholder of any kind — the mechanism this
  step describes was built elsewhere.

## Outcome

The terminal-state rendering this step asks for already exists and is genuinely
wired to `run.completed`. No code change was made or needed.

## Notes

**Letter-vs-mechanism divergence** (same class as the `frontend-localization`
plan's `S70`): the plan's step text names `agentTranscript.ts` as scope, but that
file never held run-status rendering — the actual Done/Failed terminal rendering
lives in `Transcript.tsx`'s `RUN_STATUS_MESSAGE`/`TurnStatusLine`, built as part of
the `506daa04a2` terminal-aware-invalidation work S37 also built on. The step's
INTENT (terminal states render honestly from `run.completed`) is fully satisfied;
its literal named file is not where the mechanism lives.

The one remaining gap — agent message-text position/streaming — is NOT this step's
scope: it is the a2a-side execution emission gap already named in the
`a2a-orchestration-edge` closing audit (mock-provider runs terminate at
`last_sequence:0` with zero `sse_frames`, an a2a executor-service readiness gap, not
a relay or transcript defect).

Independently reverified: read `Transcript.tsx` directly, confirming the
`RUN_STATUS_MESSAGE` map covers all five `RunStatus` tokens including `completed`
and `failed`; read `agentTranscript.ts` directly, confirming it has no run-status
code; `git show 506daa04a2 --stat` matches the terminal-invalidation claim; live
rerun of `Transcript.render.test.tsx` — 14/14 passed, including
`completed run status renders Done from the wire` (2/2) and the live-wire
`renders fixed order, an honest live indicator, and collapses on settle` test. This
record was authored during a fill pass on opus-edge's evidence report
(bookkeeping only, no code changes by me).
