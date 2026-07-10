---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-08'
step_id: 'S235'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify the Increment 3 demo: kill and restart the engine mid-review, then confirm the review surface recovers state and resumes the stream with no lost lifecycle events

## Scope

- `frontend/src/stores/server/authoring.ts`

## Description

- Verify the frontend store no longer depends on proposal/detail polling for
  steady-state authoring freshness.
- Verify lifecycle frames advance the durable cursor and invalidate projections
  without mutating cached proposal rows from event payloads.
- Verify recovery snapshot application installs `snapshot.proposals` into the
  proposal-list cache and resumes from `next_seq - 1`.
- Verify the stream subscription shares one reference-counted replay/reconnect
  loop across hook consumers.
- Verify the production frontend build after the stream cursor changes.
- Verify W11.P51 did not implement W12 generation token/transcript runtime.

## Outcome

The Increment 3 frontend-store recovery contract is verified: the authoring
store has a durable cursor, explicit gap/recovery snapshot application, bounded
finite-replay resubscribe, singleton subscription ownership, and no polling
refresh interval on the review station proposal/detail queries.

The current automated frontend harness does not expose a per-test engine restart
control, so this S235 verification did not run a full browser-level kill/restart
demo. The verified coverage is the store-level behavior required for that demo:
after a gap/recovery event, the review surface cache is restored from the
backend-served snapshot and the cursor resumes from the served next sequence.

## Notes

- Verification:
  - `vaultspec-core vault check features --feature agentic-spec-authoring-backend`
  - `npm run build`
  - `npm test -- src/stores/server/authoring.test.ts`
  - `rg -n "generation_channels|W12|token|transcript|run_id|session_id" frontend/src/stores/server/authoring.ts`
- `rg` found only the non-authoritative `generation_channels` recovery
  placeholder and existing actor-token/session command DTO fields; no W12
  generation stream, transcript compaction, run recovery, or token-channel
  runtime was added.
