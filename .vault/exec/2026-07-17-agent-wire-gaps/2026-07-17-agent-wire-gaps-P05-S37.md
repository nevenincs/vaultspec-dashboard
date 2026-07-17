---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S37'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Add SSE adapter cases for the two remaining lifecycle event kinds, turn.queued and session.cancelled (run.completed was already consumed with terminal-aware invalidation by commit 506daa04a2). Verify the shipped run.completed adapter case renders a janitor-reaped run (outcome failed, reason abandoned) honestly as Failed, needing no separate adapter arm

## Scope

- `frontend/src/stores/server/agent/index.ts`
- `frontend/src/stores/server/agent/wireTypes.ts`
- `frontend/src/stores/server/agent/wireTypes.test.ts`
- `frontend/src/stores/server/agentLifecycle.test.ts`
- `frontend/src/app/agent/Composer.tsx`
- `frontend/src/stores/server/agent/a2aTeam.ts`

## Description

- `isAgentLifecycleEvent` now claims the specific `turn.queued` kind scoped to the
  `turn` aggregate only, without widening claim to the whole `turn` aggregate (other
  `turn.*` events, e.g. `turn.created`, stay unclaimed by this consumer).
- `isTerminalRunLifecycleEvent` claims `session.cancelled` as a terminal kind, so its
  settled snapshot invalidates with `includeInactive: true` (the same active+inactive
  invalidation `run.completed` already gets), landing the session as inactive rather
  than staying stuck in-flight after a cancel.
- A new `describe("turn.queued routing (S37)")` test proves the routing:
  `routeAgentLifecycleEvent` on a `turn.queued` event invalidates the agent session
  caches so served `queued_turn_ids` refresh on the next fetch.
- Verified (no code change needed): the existing `run.completed` terminal kind at
  `agent/index.ts`'s `TERMINAL_RUN_LIFECYCLE_KINDS` set is outcome-agnostic — it
  invalidates on the event kind alone, not on the served run's `outcome`/`reason`
  fields. A janitor-reaped run (`outcome: "failed"`, `reason: "abandoned"`) still
  fires `run.completed`, so the existing single arm already renders it honestly as
  Failed on refetch; no separate adapter case for the janitor-reaped path was needed
  or added.

## Outcome

The store layer now routes both of the plan's two remaining lifecycle event kinds
(`turn.queued`, `session.cancelled`) with the same terminal-aware invalidation
discipline `run.completed` already had, and the janitor-reaped-run honesty claim is
confirmed by inspection rather than assumed.

## Notes

Landed at commit `27fbc6d1f0` ("P05 store foundation — scoped turn.queued routing,
queued_turn_ids, interrupt-list + mode-read hooks, typed resume payload w/ steer").
This commit is shared groundwork for S37 and the S39/S41/S43 data-source lanes (held
per the team lead's HOLD list — not ticked here). This record was authored during a
fill pass (bookkeeping only, no code changes by me).

Independently reverified: `git show 27fbc6d1f0 --stat` matches; live rerun of
`frontend/src/stores/server/agentLifecycle.test.ts` — 15/15 passed, including the
three S37-labeled test cases (`turn.queued` scoped-claim-without-widening,
`session.cancelled` terminal claim, `turn.queued routing (S37)` invalidation) — plus
`frontend/src/stores/server/agent/wireTypes.test.ts`'s shared
`queued_turn_ids adapter (S37/S39) > reads the served queue state, defaulting to
empty` test — 8/8 passed. Four S37-labeled test cases total across both files, all
green.
