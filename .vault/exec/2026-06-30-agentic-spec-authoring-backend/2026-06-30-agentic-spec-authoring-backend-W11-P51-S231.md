---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-08'
step_id: 'S231'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Frontend stream cursor: swap polling for the authoring lifecycle stream requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Re-read the binding W11.P51 plan rows after W11.P50 closure.
- Ground the phase against the Increment 3 reference, streaming-events/outbox
  ADR, W11.P34 stream/recovery records, the current authoring frontend store,
  and the existing graph/backend stream utilities.
- Use `vaultspec-rag` discovery via CLI fallback after the MCP transport closed.
- Dispatch a read-only checklist sidecar to challenge S232-S235 scope.
- Record the implementation, test, review, and verification checklist for S232
  through S235.

## Outcome

W11.P51 is the frontend half of Increment 3 streams/recovery. It replaces the
review station's bounded polling refresh with a store-owned lifecycle stream
cursor, while preserving the review-station rule that proposal rows, counts,
eligibility, approval state, conflicts, rollback, and after-the-fact lanes are
backend-served projections.

Grounding:

- The Increment 3 reference says lifecycle truth comes from durable outbox replay
  or snapshot-plus-next-sequence recovery; token/generation streams remain
  deferred.
- The streaming-events/outbox ADR says clients subscribe with `last_seq`,
  recover by replay or backend snapshot plus next sequence, and must not treat
  transient stream memory as product truth.
- W11.P34 implemented `/authoring/v1/events?last_seq=N` as finite SSE replay
  frames named `lifecycle`, explicit `gap` frames for invalid/ahead/too-old
  cursors, and `/authoring/v1/recovery?last_seq=N` with `snapshot.proposals` and
  `next_seq`.
- The current backend stream implementation returns finite replay from stored
  lifecycle rows. `S232` must therefore either reopen after clean replay
  completion with a bounded delay from the current durable cursor, or explicitly
  escalate a backend live-hold/notify change before claiming that polling has
  been replaced by a real long-lived subscription.
- The current frontend authoring store still has `AUTHORING_POLL_MS` and
  `refetchInterval` on proposal list/detail reads.
- The graph/backend stream analogue provides reusable pieces:
  `parseSseFrames`, `sseChunks`, bounded stream reducers, normalized cursor
  identity, and liveness state patterns. The authoring stream must reuse or
  mirror these hardened patterns rather than creating an unbounded parser or
  accumulator.

`S232` implementation checklist:

- Add authoring stream/recovery wire types and tolerant adapters for:
  lifecycle SSE record frames, gap frames, error frames with tiers, recovery
  snapshots, latest outbox sequence, next sequence, and requested cursor.
- Add an `AuthoringClient` read for `/authoring/v1/events?last_seq=N` that uses
  the existing SSE parser/reader path, and a read for
  `/authoring/v1/recovery?last_seq=N`.
- Add a store-owned lifecycle cursor with explicit state:
  `lastSeq`, connection state, recovery state, last gap/error reason, and a
  bounded retained diagnostic tail if any frames are retained.
- Replace proposal-list polling by removing `refetchInterval` from the review
  queue/detail queries and driving refreshes from lifecycle stream/recovery
  invalidation.
- On each `lifecycle` event, advance the cursor monotonically from the served
  sequence and invalidate the authoring query subtree; never derive proposal row
  state from event payloads.
- On a `gap` event, call recovery, install the recovered proposal-list snapshot
  into the query cache, set `lastSeq` to `next_seq - 1`, then resubscribe from
  that cursor.
- On stream transport failure, mark stream lost/degraded for the authoring view,
  then reconnect with capped backoff from the last durable cursor.
- On clean replay completion, resubscribe from the last durable cursor with a
  bounded delay unless the backend is changed to hold the SSE response open for
  future lifecycle events.
- Mount the authoring stream subscription once at the store/app boundary consumed
  by the review station. Avoid per-card subscriptions.
- Keep all accumulators bounded: retained frames, retry timers, recovery
  attempts, and cache fan-out.
- Preserve direct-write and command mutation invalidation behavior; commands may
  still invalidate authoring queries immediately, but steady-state freshness comes
  from stream cursor/recovery.

`S233` test checklist:

- Unit-test adapters for lifecycle, gap, error, and recovery snapshot wire shapes.
- Test cursor advance is monotonic and duplicate/old lifecycle frames do not move
  the cursor backward.
- Test lifecycle frames invalidate the authoring proposal query without deriving
  proposal state from event payloads.
- Test gap recovery installs `snapshot.proposals` into the proposal-list cache and
  resumes from `next_seq - 1`.
- Test reconnect/resubscribe uses the current cursor and bounded retry/backoff.
- Test finite replay clean completion resubscribes from the current cursor and
  does not reset processed event identity.
- Test the proposal query options no longer poll with `AUTHORING_POLL_MS`.
- Test degradation/readiness state for stream lost and store-unavailable recovery
  uses served tiers/error kinds rather than transport guesses.
- Use real store utilities/adapters and controlled in-memory transports; do not
  use fakes, mocks, stubs, monkeypatches, skips, or xfails.

`S234` review checklist:

- Review that proposal/review state remains backend-served and is refreshed by
  invalidation/recovery, not derived from lifecycle event payloads.
- Review the cursor state machine for monotonicity, gap handling,
  snapshot-plus-next-sequence recovery, and reconnect identity.
- Review resource bounds for retained frames, retry loops, timers, cache writes,
  and query invalidations.
- Review that stream errors and recovery preserve the tiers/degradation contract.
- Review that the frontend does not open multiple authoring subscriptions for
  the same review station surface.

`S235` verification checklist:

- Verify the review station no longer depends on polling for steady-state
  freshness.
- Verify a recovery snapshot can restore the proposal-list cache and resume the
  stream from `next_seq`.
- Verify the Increment 3 demo contract at frontend-store level: after a simulated
  restart/gap, the review surface recovers state and resumes without losing
  lifecycle events.
- Verify the current finite replay behavior is handled honestly: either the
  frontend reopens replay from the durable cursor, or a backend live stream
  follow-up remains open and documented.
- Verify W11.P51 does not implement W12.P44 generation/token channel runtime.

## Notes

- The `vaultspec-rag` MCP tool still failed with `Transport closed`; CLI
  `uvx vaultspec-rag search` succeeded and was used for discovery.
- Sidecar checklist reviewer `019f389c-14b6-7be0-8e3b-215515da102b` completed
  read-only review. Its blocking-risk finding is incorporated above: the backend
  `/events` route is finite replay today, so `S232` must not assume a
  permanently open authoring lifecycle stream.
