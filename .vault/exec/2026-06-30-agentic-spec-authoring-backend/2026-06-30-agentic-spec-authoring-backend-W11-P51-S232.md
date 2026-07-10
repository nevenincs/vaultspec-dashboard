---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-08'
step_id: 'S232'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement the store-owned authoring lifecycle stream cursor replacing the review station's polling refresh, mirroring the graph stream's hardened reducer patterns

## Scope

- `frontend/src/stores/server/authoring.ts`

## Description

- Add tolerant authoring lifecycle stream adapters for `lifecycle`, `gap`, and
  `error` SSE frames.
- Add tolerant recovery adapters for snapshot-plus-next-sequence responses,
  including `snapshot.proposals` and the non-authoritative generation-channel
  placeholder.
- Add `AuthoringClient` reads for `/authoring/v1/events?last_seq=N` and
  `/authoring/v1/recovery?last_seq=N`.
- Add a store-owned authoring stream cursor with bounded retained frame tail,
  monotonic `lastSeq`, connection state, recovery state, and last gap/error
  diagnostics.
- Process lifecycle frames as invalidation-only signals; do not derive proposal
  row state from event payloads.
- Process gap frames through recovery, install the recovered proposal-list
  snapshot into the authoring query cache, and resume from `next_seq - 1`.
- Handle the current finite replay backend by reopening cleanly from the durable
  cursor with a bounded delay.
- Share the lifecycle replay/reconnect loop through a module-level,
  reference-counted subscription so multiple store hook consumers do not open
  multiple authoring streams.
- Remove review-station proposal/detail polling intervals so steady-state
  freshness comes from the lifecycle cursor and recovery path.

## Outcome

The frontend authoring store now owns the review station lifecycle stream cursor.
`useReviewStationView` mounts the subscription, proposal list/detail queries no
longer carry `refetchInterval`, and command mutations keep their immediate
authoring invalidation behavior.

The implementation mirrors the existing graph stream hardening by reusing the
shared SSE reader and bounded stream reducer. It preserves the binding review
station rule: lifecycle events advance a cursor and invalidate projections, while
proposal rows, eligibility, approval state, conflict state, rollback state, and
after-the-fact lanes remain backend-served projections.

Because the backend `/events` endpoint currently serves finite replay rather
than a held live stream, the frontend explicitly reopens after clean replay
completion. This is a bounded replay cursor loop, not an assumption that the
server holds the socket open.

The replay cursor loop is module-singleton and reference-counted; React hook
consumers subscribe/unsubscribe without each owning a separate socket/replay
loop.

## Notes

- Verification during S232:
  - `npm run typecheck`
  - `npm test -- src/stores/server/authoring.test.ts`
  - `npx prettier --check src/stores/server/authoring.ts`
- A first `npm exec prettier --write ...` invocation was parsed by npm as a
  command argument and printed file content; `npx prettier --write` was then used
  successfully on only the edited store file.
