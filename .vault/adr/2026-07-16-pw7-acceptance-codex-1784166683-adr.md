---
tags:
  - '#adr'
  - '#pw7-acceptance-codex-1784166683'
date: '2026-07-16'
modified: '2026-07-16'
related:
  - "[[2026-07-16-pw7-acceptance-codex-1784166683-research]]"
---

# `pw7-acceptance-codex-1784166683` adr: `SSE reconnection and cursor persistence for long-lived dashboard event streams` | (**status:** `accepted`)

## Problem Statement

The dashboard needs a long-lived SSE strategy that recovers across transient failures, reloads, browser restarts, and replay-retention gaps without silently losing events or creating unbounded reconnect pressure. The approved `2026-07-16-pw7-acceptance-codex-1784166683-research` establishes the recovery and consistency concerns that this ADR resolves.

## Considerations

- Delivery will be at least once: preventing event loss takes precedence over preventing duplicate delivery.
- The server owns cursor meaning and replay ordering; clients must treat cursors as opaque strings.
- A persisted cursor is valid only with the materialized dashboard state represented by that cursor.
- Snapshot installation and stream resumption must share a consistent checkpoint boundary.
- Retention gaps must cause an explicit recovery transition rather than an implicit jump to the current stream head.
- Retry behavior must be bounded, cancellable, and dispersed across clients.
- The fetch-based approach favored by `2026-07-16-pw7-acceptance-codex-1784166683-research` requires a standards-conformant SSE parser.
- Connection ownership must prevent multiple components in one dashboard runtime from independently opening streams.

## Constraints

- The client cannot parse, increment, compare, or derive timestamps from cursors.
- Every replayable event must have a non-empty `id` without U+0000; heartbeats must be SSE comments and must not advance the cursor.
- The server must expose one total replay order or encode every necessary partition position within one opaque cursor. Implementation is blocked until this property is confirmed.
- The snapshot service must return snapshot data and its cursor from one consistent boundary. Implementation is blocked if that guarantee cannot be provided.
- Authentication topology, proxy timeout values, reducer idempotency, and existing storage conventions remain gaps identified by `2026-07-16-pw7-acceptance-codex-1784166683-research`; implementation must verify them without changing this recovery model.
- Cursor records must be isolated by stream, environment, authenticated subject or tenant, and schema version.
- Logout, authorization-scope changes, and incompatible schema changes must invalidate the corresponding checkpoint.
- Retry timers, response readers, and active requests must be cancellable when their owning runtime stops.

## Considered Options

### Native `EventSource` with an in-memory cursor

Rejected. It does not provide durable recovery across a newly constructed client and cannot support the required application-controlled stale-cursor transition and jitter policy.

### Native `EventSource` with a persisted cursor in the URL

Rejected. It exposes the cursor to URL-oriented infrastructure and still limits control over response handling and retry orchestration.

### Fetch-based SSE with a scalar cursor in `localStorage`

Rejected. A scalar cursor cannot atomically represent the materialized dashboard state it advances. Resuming from it after in-memory state has disappeared could skip state transitions.

### Fetch-based SSE with an IndexedDB checkpoint

Accepted. A conforming parser and application-owned state machine provide explicit recovery control, while IndexedDB permits materialized state and its cursor to be committed together.

### Expired cursors silently resume at the current head

Rejected. This would turn a detectable retention gap into silent dashboard divergence.

### Expired cursors trigger a new checkpointed snapshot

Accepted. It restores a known state boundary before streaming resumes.

### Shared cross-tab connection

Deferred. Cross-tab coordination and runtime compatibility were not established by the research. This ADR permits one stream owner per dashboard tab while preventing duplicate streams within that tab.

## Implementation

Implement one application-owned stream controller per dashboard runtime. Components consume events through that controller and must not construct independent SSE connections.

The server wire contract is:

- A stream request uses `GET`, advertises `Accept: text/event-stream`, and supplies the last committed opaque cursor in the `Last-Event-ID` header. The header is omitted when no checkpoint exists.
- A successful stream returns HTTP 200 with `Content-Type: text/event-stream`.
- Every replayable event supplies `id`, `event`, and `data` fields. Heartbeats are comment lines.
- Given a valid cursor, the server emits retained events strictly after that cursor or holds the connection open when the client is current.
- An unknown, invalid, or expired cursor returns HTTP 410 before streaming begins, with an `application/json` body containing `{ "code": "cursor_expired" }`.
- The snapshot operation returns an envelope containing `snapshot` and an opaque `cursor` captured from the same consistency boundary.
- The server retains replayable events for at least 24 hours. Clients behind that window recover through a snapshot rather than receiving a partial replay.

Store checkpoints in IndexedDB under a key composed from schema version, environment, stream identity, and authenticated subject or tenant. A checkpoint contains the materialized dashboard state and its opaque cursor. No cursor is stored in URLs, and a cursor is never reused across mismatched checkpoint scopes.

Startup and reset follow this sequence:

1. Load a compatible checkpoint.
2. If none exists, request the checkpointed snapshot.
3. Validate the snapshot and commit its materialized state and cursor in one IndexedDB transaction.
4. Publish the committed state to the dashboard.
5. Open the stream strictly after the committed cursor.
6. For each event, validate its envelope and payload, derive the next state through an idempotent event handler, commit that state and the event cursor in one IndexedDB transaction, and only then publish it.
7. If the stream returns `cursor_expired`, delete the incompatible checkpoint and repeat the snapshot sequence.
8. Malformed events do not advance the cursor and terminate the connection for a retry; they must also produce diagnostics.

As required by `2026-07-16-pw7-acceptance-codex-1784166683-research`, the parser must correctly handle incremental UTF-8 decoding, split lines, multiple `data` fields, blank-line dispatch, comments, byte-order marks, and the `event`, `id`, and decimal `retry` field grammar. The application retry policy remains authoritative; server `retry` fields do not override it.

Reconnect attempt `n`, starting at zero, uses a ceiling of `min(30 seconds, 1 second × 2^n)` and selects a uniformly random delay from zero through that ceiling. The attempt count resets after the connection delivers one valid event or remains continuously healthy for 30 seconds. Retries pause while the browser reports offline, resume when it reports online, and remain subject to normal endpoint failure handling because connectivity signals are advisory.

The initial ownership model permits one stream per open dashboard tab. Within a tab, route changes and component remounts reuse the same controller. Connection counts, retry counts, cursor-expiration rates, replay sizes, snapshot resets, parser failures, and checkpoint failures must be observable before considering cross-tab sharing.

## Rationale

This decision follows the evidence-favored direction in `2026-07-16-pw7-acceptance-codex-1784166683-research`: application-controlled fetch streaming is necessary for durable initial cursors, explicit stale-cursor handling, bounded jitter, and cancellation. An opaque server cursor preserves freedom to change replay implementation without coupling clients to offsets or timestamps.

Committing materialized state and cursor together chooses replayable duplicates over permanent omissions. The explicit snapshot transition closes both retention gaps and snapshot-to-stream races. A 24-hour initial retention contract bounds server storage while defining when snapshot recovery is expected; it is an operational decision and may be increased without changing the client protocol.

One connection per tab limits the first implementation to behavior supported by the approved research. Cross-tab sharing remains a separate decision because its compatibility and coordination requirements have not been established.

## Consequences

The dashboard gains deterministic recovery, durable checkpoints, explicit retention-gap handling, bounded reconnect pressure, and a cursor contract independent of server storage internals. Reloads and browser restarts can resume from an atomically persisted state rather than combining a new in-memory state with an unrelated cursor.

The implementation becomes more complex than native `EventSource`. It must maintain a conforming parser, an IndexedDB schema and migrations, idempotent event handlers, snapshot recovery, cancellation, and operational telemetry. Per-event durable transactions may also affect throughput and must be measured against the project’s resource bounds.

This decision opens follow-up work to confirm total ordering, define snapshot consistency, select or verify the parser, establish proxy-aware heartbeat timing, document authentication invalidation, and test real reducer idempotency. Cross-tab sharing through a compatible coordination mechanism may be proposed if measured connection pressure justifies it.

This ADR should be superseded if the server cannot provide a total or composite replay cursor, cannot produce a checkpointed snapshot, or adopts a different durable delivery protocol. A later ADR may supersede only the retention period, storage layout, retry constants, or connection-ownership model while preserving the opaque-cursor, atomic-checkpoint, and explicit-reset guarantees.