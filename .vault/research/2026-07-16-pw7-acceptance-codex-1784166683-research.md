---
tags:
  - '#research'
  - '#pw7-acceptance-codex-1784166683'
date: '2026-07-16'
modified: '2026-07-17'
related: []
---

# SSE Reconnection and Cursor Persistence for Long-Lived Dashboard Event Streams

The question is how a long-lived dashboard SSE client should reconnect without losing, duplicating, or permanently skipping events, including after reloads and offline periods. The stakes are silent dashboard divergence, reconnect storms, and clients trapped behind expired cursors. The evidence favors an application-controlled reconnect loop, an opaque server-issued cursor persisted only after successful event application, idempotent event handling, and an explicit snapshot-reset path when retained history cannot satisfy a cursor.

## Scope

This research covers browser SSE consumption, reconnect timing, server and client cursor responsibilities, durable browser storage, duplicate delivery, retention gaps, and multi-tab resource pressure.

It does not investigate authentication topology, proxy-specific timeout values, the dashboard’s existing event reducer, server database selection, service-worker ownership, or whether events originate from one ordered log or several partitions. Those details must be confirmed before the ADR fixes the wire contract.

## Findings

### Native EventSource provides resumption primitives but insufficient recovery control

Native `EventSource` automatically reconnects after most connection failures. It maintains a last-event ID string, updates it from valid `id:` fields, and sends that value in the `Last-Event-ID` request header when reconnecting. A server can replace the user agent’s reconnection delay with a non-negative integer `retry:` value in milliseconds. An HTTP 204 response tells the client to stop reconnecting. (S1, sections 9.2.3–9.2.6)

These semantics preserve the cursor only for the lifetime of the `EventSource` object. The standard does not require the browser to retain the last-event ID across a page reload, browser restart, or newly constructed object. Durable recovery therefore requires an application or server-side cursor store. (S1, section 9.2.3)

The constructor accepts only a URL and an optional `withCredentials` flag; it does not expose arbitrary request headers. Supplying a durable initial cursor consequently requires a query parameter, cookie-backed server session, or fetch-based SSE client. A query cursor may appear in access logs and observability systems, so it must be opaque and contain neither credentials nor sensitive event data. (S1, section 9.2.2; S2, section 17.9)

Native reconnection cannot interpret application-specific stale-cursor responses or implement an application-selected exponential-jitter policy. Returning an error for an expired cursor risks a repeated reconnect loop, while returning 204 stops reconnection without delivering a structured recovery instruction. Application-controlled reconnection is therefore favored when retention gaps and offline recovery are expected operating conditions. (S1, sections 9.2.3 and 9.2.5)

### The cursor must represent a server-defined replay position

A resumable stream needs a stable, unique cursor whose meaning is owned by the server. SSE treats event IDs as strings, so clients should store and return them without parsing, incrementing, comparing, or deriving timestamps from them. This permits server implementations based on sequence numbers, log offsets, signed tokens, or composite positions. (S1, sections 9.2.4 and 9.2.6)

A scalar cursor is sufficient only if the server exposes one replay order for every event relevant to the dashboard. If independent partitions advance concurrently, the server must merge them into a total order or issue an opaque cursor that captures all required partition positions. Whether the current event source has either property remains uninvestigated.

Every replayable message must carry an `id:` value. Heartbeats should use SSE comment lines rather than synthetic IDs because comments keep the connection active without advancing the resume position. An empty `id:` resets the user agent’s last-event ID, and an ID containing U+0000 is ignored; the producer must avoid both unless reset behavior is intentional. (S1, sections 9.2.4 and 9.2.6)

Cursor retention is part of the server contract. Given cursor `C`, the server must produce exactly one of three outcomes:

1. Replay all retained events strictly after `C`.
2. Establish that the client is current and continue waiting for new events.
3. Report that `C` is unknown or older than retained history and require a fresh snapshot.

Treating an expired cursor as an empty stream is unsafe because the client cannot distinguish “caught up” from “irrecoverably behind.”

### Persistence after successful application provides recoverable at-least-once delivery

The client must advance its durable cursor only after the corresponding event has been validated and successfully applied. Persisting before application can permanently skip an event if the process terminates between the cursor write and the state update. Persisting afterward can replay an already-applied event if termination occurs before the cursor write, so handlers must be idempotent by event ID or produce the same state when an event is repeated.

A cursor alone is not an atomic checkpoint for in-memory dashboard state. If a reload reconstructs state from a snapshot, that snapshot must identify the cursor it includes; the client then resumes strictly after that cursor. If the client persists materialized state, the state mutation and cursor advancement must commit in one durable transaction. IndexedDB supports transactions over multiple object stores, whereas Web Storage exposes synchronous string-key operations without a multi-record transaction boundary. (S3, sections 2.7 and 5.4; S4, sections 4.1–4.3)

For a scalar cursor whose associated dashboard state always comes from a server snapshot, `localStorage` persists across browsing sessions and is shared by same-origin tabs. `sessionStorage` is isolated by top-level browsing context and ends with the page session, so it does not provide browser-restart recovery. IndexedDB is favored when cursor updates must be transactionally coupled to cached state or the checkpoint contains more than a scalar. (S4, sections 4.2 and 4.3)

The persisted record should contain a schema version, stream identity, authenticated subject or tenant identity, and cursor. Binding the cursor to the stream and authorization scope prevents one account, filter, or environment from resuming another’s position. Logout and authorization-scope changes must invalidate the record.

### Recovery requires an explicit snapshot-to-stream handshake

A snapshot and stream opened independently can race: events committed after the snapshot query but before stream establishment may be missed. The server must return a snapshot and checkpoint cursor from a consistent boundary, after which the client requests events strictly after that cursor.

A safe startup sequence is:

1. Load the persisted record and verify that its schema, stream identity, and authorization scope match.
2. If no compatible state checkpoint exists, request a fresh snapshot carrying checkpoint cursor `S`.
3. Install the snapshot, then durably store `S`.
4. Open the event stream after `S`.
5. For each event, reject malformed data, apply it idempotently, and then persist its cursor.
6. On an expired or invalid cursor, discard the incompatible checkpoint and repeat the snapshot handshake.

The stale-cursor signal should be machine-readable and terminal for that connection. A fetch-based client can interpret a documented HTTP status such as 409 or 410 with a structured error body before parsing the SSE stream. HTTP 410 means access to the target resource is no longer available and is likely permanent; it is suitable only if the endpoint contract defines the cursor, rather than the stream resource, as the unavailable item. (S2, section 15.5.11)

### Reconnection needs bounded exponential backoff with jitter

Immediate or synchronized retries can amplify a server or network outage. An application-controlled client can use capped exponential backoff and choose each delay uniformly between zero and the current cap, known as full jitter, to spread concurrent retry attempts. (S5, “Exponential Backoff and Jitter,” full-jitter algorithm)

The standards do not prescribe the base delay, cap, or stable-connection reset interval. A candidate policy for ADR evaluation is a 1-second base, doubling caps of 1, 2, 4, 8, 16, and 30 seconds, with a random delay from zero through the current cap. The attempt counter should reset only after the stream remains healthy for a defined interval or delivers a valid event; resetting immediately after HTTP connection establishment permits rapid loops when the server repeatedly disconnects shortly afterward. These values are proposed operational bounds, not established project requirements.

Retries should pause while the browser reports it is offline and resume on an online signal, but browser connectivity signals do not prove endpoint reachability. Retry timers and active requests must be cancelled when the owning component or application shuts down.

Server-provided retry hints may increase the current minimum delay but should not bypass the client’s configured maximum without an explicit contract. Standard SSE `retry:` specifies an exact native `EventSource` reconnection time rather than a jitter range. (S1, section 9.2.6)

### Long-lived streams need bounded parsing and connection ownership

A fetch-based implementation assumes responsibility for incremental UTF-8 decoding and SSE field parsing. It must handle chunks that split code points or lines, multiple `data:` lines joined with newline characters, blank-line dispatch, comments, byte-order marks, `event:`, `id:`, and decimal `retry:` rules. Replacing the native client is justified only if the implementation uses a conforming parser or is verified against these specified cases. (S1, sections 9.2.4–9.2.6)

Under HTTP/1.x, the HTML standard identifies a per-browser-and-domain connection limit of six as a practical problem when multiple pages open separate SSE connections. HTTP/2 multiplexing avoids that specific HTTP/1.x limit, but each stream still consumes application and server resources. The standard recommends sharing one SSE connection through a shared worker where practical. (S1, section 9.2.5)

Cross-tab leader election through `BroadcastChannel`, shared-worker compatibility, and desktop-webview behavior were not investigated. An initial implementation may use one connection per dashboard instance only if expected tab counts and server connection budgets are documented.

## Alternatives Considered

| Alternative | Disposition | Rationale |
| --- | --- | --- |
| Native `EventSource` with in-memory `Last-Event-ID` only | Rejected | Reloads and restarts lose the resume position; stale-cursor recovery and jittered backoff cannot be controlled. |
| Native `EventSource` plus cursor in the URL | Kept as a constrained option | It preserves native parsing and reconnect behavior, but cursor exposure, custom recovery responses, and retry orchestration remain limited. It fits only when replay gaps are exceptional and retention exceeds every required offline interval. |
| Fetch-based SSE with application-controlled reconnect | Evidence-favored | It supports an initial durable cursor, explicit stale-cursor responses, bounded jitter, cancellation, and authentication headers at the cost of owning standards-conformant parsing. |
| Persist cursor before applying an event | Rejected | A crash between persistence and application causes permanent event loss. |
| Persist cursor after applying an idempotent event | Kept | A crash can cause duplicate delivery but does not skip the event, providing recoverable at-least-once behavior. |
| Persist only a cursor beside unrelated in-memory state | Rejected unless startup always fetches a checkpointed snapshot | The cursor can advance beyond state that disappears on reload. |
| Persist state and cursor in one IndexedDB transaction | Kept where offline cached state is required | It provides an atomic local checkpoint but adds schema, migration, and storage complexity. |
| Use `localStorage` for a scoped scalar snapshot cursor | Kept where state is rebuilt from the server | It is durable across sessions, provided the snapshot cursor is stored only after snapshot installation and event handlers tolerate replay. |
| Use timestamps as cursors | Rejected | Equal timestamps, clock behavior, and distributed writers do not establish an unambiguous replay position. |
| Silently start at the current head when a cursor expires | Rejected | It converts a detectable retention gap into silent data loss. |
| Reset through a fresh snapshot and checkpoint cursor | Kept | It restores a known-consistent state before replay continues. |

## Evidence-Favored Direction

The evidence favors a fetch-based SSE consumer using a standards-conformant parser and one application-owned reconnect state machine. The server should issue opaque event IDs, accept an opaque resume cursor, retain a documented replay window, and return an explicit stale-cursor outcome that triggers a checkpointed snapshot refresh.

The client should persist a versioned, stream-scoped cursor only after successful idempotent application. `localStorage` is sufficient when every startup reconstructs dashboard state from a server snapshot carrying its own cursor. IndexedDB is favored when cached state and cursor must survive together because they can be committed in one transaction.

The ADR must decide the wire fields, cursor transport, stale-cursor status, storage backend, retry constants, retention window, and whether one connection per tab fits the project’s resource bounds.

## Open Questions

- Does the event source provide one total replay order, or must the cursor encode multiple partitions?
- Can the snapshot service return data and a cursor from one consistent boundary?
- What replay-retention duration covers the dashboard’s required offline interval?
- Are cursors safe to expose in URLs and infrastructure logs, or is a header-based fetch client mandatory?
- Is dashboard state always rebuilt from the server, or must local cached state be transactionally checkpointed?
- Which event operations are naturally idempotent, and which require deduplication by event ID?
- What authentication or tenant changes invalidate a saved checkpoint?
- How many simultaneous dashboard tabs and server-side stream connections must be supported?
- Which proxy, load-balancer, and hosting timeouts determine the heartbeat interval?
- Which conforming SSE parser is acceptable under the project’s dependency policy?

## Sources

1. WHATWG, “HTML Living Standard: Server-sent events,” sections 9.2.2–9.2.6, accessed 2026-07-16: https://html.spec.whatwg.org/multipage/server-sent-events.html
2. IETF, RFC 9110, “HTTP Semantics,” June 2022, sections 15.5.11 and 17.9: https://www.rfc-editor.org/rfc/rfc9110
3. W3C, “Indexed Database API 3.0,” sections 2.7 and 5.4, W3C Recommendation, 2025-05-13: https://www.w3.org/TR/IndexedDB-3/
4. WHATWG, “Web Storage Living Standard,” sections 4.1–4.3, accessed 2026-07-16: https://storage.spec.whatwg.org/
5. Marc Brooker, AWS Architecture Blog, “Exponential Backoff and Jitter,” updated 2023-05-16: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
