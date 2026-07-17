---
tags:
  - '#research'
  - '#pw7-acceptance-zai-1784221291'
date: '2026-07-16'
modified: '2026-07-17'
related: []
---

# `sse-reconnection-strategy` research: `SSE reconnection and cursor-persistence strategy for long-lived dashboard event streams`

## Problem Statement

Dashboard event streams power live state synchronization across multiple planes: graph deltas, backend signals (rag/core), git status, and authoring lifecycle events. These streams must survive transient network blips, browser tab lifecycle changes (hidden/visible/refresh), and long-running sessions without silent data loss or unbounded memory growth. The current implementation has reconnection logic and gap handling, but lacks a unified strategy for cursor persistence and coordinated recovery across all stream types.

## Findings

### Current Engine Implementation

**Main `/stream` endpoint** (`engine/crates/vaultspec-api/src/routes/stream.rs:105-210`):
- Per-scope cells with monotonic sequence numbers (`seq` atomic)
- Ring buffer holds recent events; `since=` parameter resumes from a known sequence
- Gap detection: when `since + 1 < oldest_buffered`, server emits explicit `gap` event with `{"requested": since, "oldest_buffered": oldest}`
- Broadcast channel with lag detection: slow consumers receive `gap` event with `{"lagged": n, "reason": "broadcast lag"}`
- `/status` reports `last_seq` for the active scope (recovery snapshot entry point)
- Scope isolation: each workspace has its own monotonic clock; `scope` parameter routes to correct cell

**Authoring lifecycle streams** (`engine/crates/vaultspec-api/src/authoring/stream.rs`):
- `GET /authoring/v1/events?last_seq=N` replays durable lifecycle events from outbox
- `GET /authoring/v1/recovery?last_seq=N` serves tiered snapshot plus `next_seq`
- `LIFECYCLE_REPLAY_PAGE_CAP = 128` - replay window bounded to prevent unbounded reads
- Gap events for: invalid cursor, cursor ahead of high-water, replay window exceeded
- Generation channels (token/trace frames) are **non-authoritative** and bounded by `GENERATION_CHANNEL_FRAME_CAP = 256`
- Durable outbox (`authoring/stream.rs:182-225`) ensures lifecycle events survive restart

### Current Frontend Implementation

**General SSE consumption** (`frontend/src/stores/server/queries/streams.ts:146-184`):
- TanStack Query's `experimental_streamedQuery` with custom reducer
- Retry: `retry: true` with exponential backoff (`250ms` first retry, `1_000 * 2^attempt`, capped at `30s`)
- Stream retention: `STREAM_RETENTION = 256` chunks with seq-dedup reducer
- `useBackendSignalStream` consumes `["backends", "git"]` channels (always-on signals)
- Hidden-tab pause: `useDocumentHiddenPause` with 60-second grace before closing EventSource
- Pause implementation (streams.ts:259-286): cancels query, invalidates on resume, reopens stream

**Authoring stream handling** (`frontend/src/stores/server/authoring/index.ts:611-810`):
- Module-level `authoringStreamCursor` state holds `lastSeq`, `connected`, `recovering`, `retained[]`
- `AUTHORING_STREAM_REOPEN_MS = 1_000` for manual reopen timing
- `AUTHORING_STREAM_RETRY_BASE_MS = 250`, `AUTHORING_STREAM_RETRY_MAX_MS = 30_000`
- Recovery flow: detect gap → request `/recovery?last_seq=N` → resume with `next_seq`
- Cursor normalization: `normalizeAuthoringStreamSeq` validates safe integer range

### Existing ADRs Governing SSE Behavior

**`universal-data-loading` ADR (2026-07-11)** D4 — Hidden-tab pause for always-on signal SSE:
- Grace period (60s) before closing `backends`+`git` EventSource on `document.hidden`
- Re-subscription re-snapshots on visibility return; gap considered acceptable
- Mount-gating codified as canonical visibility mechanism (prevents `enabled:false` queries)

**`agentic-streaming-events-outbox` ADR (2026-06-29)**:
- Durable lifecycle events in outbox; raw token/trace streams are bounded and non-authoritative
- Clients recover truth via snapshot/replay, not transient frames
- `last_seq` cursor semantics: replay from after given sequence

### Cursor Persistence Gap

**No localStorage/sessionStorage persistence** across browser refresh:
- All cursors (`lastSeq`, `since`) are runtime-only in TanStack cache
- Refresh forces re-keyframe from beginning (`since=` omitted or reset to 0)
- Authoring `authoringStreamCursor` is module-scoped runtime state, not persisted
- Recovery relies on server-side replay window, not client-side continuity

### Reconnection Behavior Analysis

**Exponential backoff configuration** (streams.ts:177-182):
```typescript
retryDelay: (attempt) =>
  attempt === 0 ? 250 : Math.min(30_000, 1_000 * 2 ** attempt)
```
- First retry: 250ms (fast recovery from transient blip)
- Subsequent: 1s, 2s, 4s, 8s, 16s, 30s (capped)
- No maximum attempt count — theoretically infinite retries

**Hidden-tab pause** (universal-data-loading D4):
- 60-second grace allows brief tab switches without churn
- Stream closes after grace; reopens on visibility with fresh snapshot
- Only applies to `backends`+`git`; graph SSE is mount-gated (already closed on compact)

### Stream Types and Coordination

**Three independent stream families**:
1. **Graph delta stream**: Per-scope, `since=keyframeSeq`, mount-gated, powers 3D scene
2. **Backend signals stream**: Always-on, hidden-tab pause, no cursor (current state only)
3. **Authoring lifecycle stream**: `last_seq` cursor, recovery snapshot, dedicated state machine

Each maintains separate retry logic, cursors, and gap handling; no unified recovery coordination.

### Identified Failure Modes

**Cursor loss scenarios**:
1. Browser refresh — all runtime cursors reset to zero
2. TanStack cache eviction (`gcTime: 30_000` on streams) — cursor lost if unobserved
3. Navigate away and back — fresh stream starts from beginning
4. Ring buffer eviction on engine (server-side gap) — client must detect and re-keyframe

**Silent divergence risks**:
1. Slow consumer lag — handled by `gap` events with `lagged` count
2. Network partition during write — monotonic seq ensures detection on reconnect
3. Scope switch without re-subscription — cross-scope contamination prevented by scope parameter

### Browser and Memory Constraints

**EventSource limitations**:
- No native reconnection with custom `since=` parameter (browser reopens from zero)
- Requires explicit close/reopen to resume with cursor
- Connection pooling limits (typically 6 per domain in Chrome)

**Memory bounds enforced**:
- `STREAM_RETENTION = 256` chunks per stream (streams.ts:119)
- `LIFECYCLE_REPLAY_PAGE_CAP = 128` events per replay
- `GENERATION_CHANNEL_FRAME_CAP = 256` frames per generation page
- Ring buffer size on engine (not directly specified but bounded by design)

### Alternative Patterns Not Currently Used

**WebSocket vs SSE**:
- WebSocket supports bidirectional messaging and custom reconnection protocols
- SSE is simpler (unidirectional, built-in retry) but lacks native cursor continuation
- No evidence of WebSocket evaluation in codebase; SSE is entrenched

**Service Worker + Sync Manager**:
- Service workers can persist cursors and handle background reconnection
- Not used; dashboard runs in standard SPA context

## Uninvestigated Areas

- **Multi-tab coordination**: If user opens dashboard in multiple tabs, each opens independent EventSources; no coordination or tab-activation signaling
- **Cursor versioning**: No schema evolution strategy for `last_seq` format if engine sequence generation changes
- **Long-running session limits**: No maximum session duration or forced reconnection interval
- **Mobile constraints**: Cellular networks, background tab throttling, and memory pressure on mobile devices not specifically analyzed
- **Cross-origin behavior**: Dashboard shares engine origin; no CORS/SSE proxy complexity identified

## Sources

- `engine/crates/vaultspec-api/src/routes/stream.rs:105-210` — main SSE endpoint with since= resume and gap detection
- `engine/crates/vaultspec-api/src/routes/stream.rs:22-103` — /status recovery snapshot with last_seq
- `engine/crates/vaultspec-api/src/authoring/stream.rs:62-180` — authoring events stream and recovery
- `engine/crates/vaultspec-api/src/authoring/stream.rs:182-225` — lifecycle_replay_events with gap handling
- `engine/crates/vaultspec-api/src/authoring/events.rs` — lifecycle event vocabulary and outbox schema
- `frontend/src/stores/server/queries/streams.ts:146-184` — TanStack streamedQuery with retry backoff
- `frontend/src/stores/server/queries/streams.ts:222-246` — useDocumentHiddenPause with 60s grace
- `frontend/src/stores/server/queries/streams.ts:259-286` — backend signal stream with pause/resume
- `frontend/src/stores/server/authoring/index.ts:611-810` — authoringStreamCursor state management
- `frontend/src/stores/server/authoring/adapters.ts:38-55` — AUTHORING_STREAM_* timing constants
- `2026-07-11-universal-data-loading-adr.md` D4 — hidden-tab pause decision
- `2026-06-29-agentic-streaming-events-outbox-adr.md` — durable lifecycle events vs transient frames
