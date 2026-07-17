---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S42'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Retire the session-actor-latest correlation mark and bind the inline proposal card to its proposal's served run_id

## Scope

- `frontend/src/app/agent/ProposalCard.tsx`
- `frontend/src/app/agent/ProposalCard.correlation.test.ts`
- `frontend/src/app/agent/Transcript.tsx`
- `frontend/src/stores/server/authoring/adapters.ts`
- `frontend/src/stores/server/authoring/wireTypes.ts`

## Description

- Retired the `session-actor-latest` correlation heuristic (actor-identity match
  floored on session start time, newest-wins) — the marker constant
  `AGENT_PROPOSAL_CORRELATION` flips from `"session-actor-latest"` to `"run-id"`.
- Bound `ProposalCard` to its proposal by an EXACT match on the served `run_id`: the
  `ProposalProjection` now carries the agent provenance `run_id` (agent-wire-gaps
  D4/D5), so a proposal correlates to the turn whose run produced it, not a
  same-session-newest guess.
- A proposal with no served `run_id` (a non-agent changeset) correlates to nothing
  and the slot stays honestly empty, rather than falling back to the heuristic.
- Updated `adapters.ts`/`wireTypes.ts` to carry the new served `run_id` field
  through the proposal projection adapter.

## Outcome

Closes the previously-tracked proposal↔run correlation gap: the inline proposal
card now binds to the SPECIFIC run/turn that produced it via a served field, not an
actor-identity/timing heuristic that could bleed between same-session proposals or
misfire across two sessions started in the same millisecond.

## Notes

Landed at commit `067dd22051` ("retire session-actor-latest correlation — proposal
cards bind per-turn by served run_id, D4 cutover"). This record was authored during
a fill pass (bookkeeping only, no code changes by me).

Independently reverified: `git show 067dd22051 --stat` matches the reported 5
files; live rerun of `ProposalCard.correlation.test.ts` (rewritten to prove the
exact `run_id` bind, no heuristic) and `Transcript.render.test.tsx` — 18/18 passed
combined.
