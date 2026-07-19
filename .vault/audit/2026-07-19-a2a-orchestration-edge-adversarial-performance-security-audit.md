---
tags:
  - '#audit'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
related:
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# `a2a-orchestration-edge` audit: `adversarial performance, conformance, and security review`

## Scope

An adversarial review of the shipped dashboard active-run discovery and reload
recovery implementation, including its engine boundary, frontend query and
render lifecycle, sibling A2A contract, and interaction with existing status
and SSE recovery paths. The review prioritizes bounded memory, avoidable work,
runtime behavior under churn, contract fidelity, and pragmatic local-product
security rather than enterprise controls.

## Findings

### relay-framing-allocation | high | Frame and header ceilings are enforced after unbounded allocation

Open. The relay's advertised 512 KiB frame ceiling is not an allocation
ceiling. `read_http_head` repeatedly uses unbounded `read_line` buffers
(`engine/crates/vaultspec-api/src/routes/ops/a2a_stream.rs`, `read_http_head`,
lines 315-338); `BodyDecoder::next_chunk` trusts the peer's hexadecimal chunk
size and executes `vec![0; size]` before comparing anything with
`MAX_RELAY_FRAME_BYTES` (lines 431-448); and `SseAccumulator::push_bytes`
appends an unterminated frame indefinitely, with the size check occurring only
after a blank-line delimiter reaches `parse_sse_frame` (lines 466-479 and
493-503). The browser has the same incomplete-frame weakness: `sseChunks`
appends every read to `buffer`, while `MAX_SSE_FRAME_BYTES` is consulted only
for completed frames in `parseSseFrames`
(`frontend/src/stores/server/queries/streams.ts`, lines 33-65 and 87-105). A
malfunctioning or locally compromised sibling can therefore force process or
renderer memory exhaustion despite the documented caps. This is high rather
than critical because exploitation requires control of, or a severe fault in,
the loopback sibling/engine stream.

Minimal recommendation: impose a total HTTP-header ceiling, reject a declared
chunk larger than the remaining frame allowance before allocation, make the
SSE accumulator byte-counted across chunk boundaries and discard-until-delimiter
after overflow, and abort the browser stream when its incomplete remainder
crosses the ceiling. Verification must feed a giant declared chunk, an endless
header line, and a delimiter-free frame in small fragments through the real
parsers and assert bounded allocation plus a drop/degraded outcome.

### relay-registry-lifecycle | high | Viewer churn leaves non-terminal relay tombstones that cannot restart

Open. `get_or_start_relay` returns any existing entry without checking whether
its reader is still running and prunes only terminal entries with no receivers
(`engine/crates/vaultspec-api/src/routes/ops/a2a_stream.rs`, lines 178-189).
The reader deliberately stops when the last subscriber disappears (lines
289-300), and its fallback also exits with no receiver (lines 539-550), but the
thread-exit cleanup removes the map entry only when the relay is terminal
(lines 196-206). Consequently, closing the panel during a non-terminal run can
leave a producerless entry forever; reopening returns that stale relay instead
of reconnecting. Churning 64 distinct run ids can permanently reach
`MAX_CONCURRENT_RELAYS`, retain every ring, and degrade all later runs to
`relay_capacity` until the engine restarts.

Minimal recommendation: track reader liveness/generation, remove every stopped
unsubscribed relay regardless of terminal state, and atomically restart an
existing producerless entry when a viewer returns. Verification should use real
socket relays to disconnect/reopen one active run and then churn more than 64
active run ids, proving the original run resumes and the registry returns below
capacity without a process restart.

### relay-memory-budget | high | Count bounds permit tens of gigabytes of retained relay data

Open. One relay can retain 1,024 ring frames plus 256 broadcast frames, and each
accepted frame may approach 512 KiB (`RELAY_RING_CAP`,
`RELAY_BROADCAST_CAP`, and `MAX_RELAY_FRAME_BYTES` at
`engine/crates/vaultspec-api/src/routes/ops/a2a_stream.rs`, lines 51-64). The
ring stores a deep `serde_json::Value` clone before the original enters the
broadcast channel (`RunRelay::push`, lines 116-135). At the 64-relay admission
ceiling (lines 82-84), the count-only theoretical payload retention is about
40 GiB; even the sibling's intended 256 KiB frame ceiling permits about 20 GiB,
before JSON allocation overhead. A no-`since` subscriber then deep-clones the
whole ring and eagerly materializes a serialized `Event` backlog (lines
142-155 and 689-710), causing another large transient spike. The frontend also
retains 256 payload objects by count and reconstructs a derived transcript on
every frame (`frontend/src/stores/server/liveAdapters/a2aRelay.ts`, lines
17-20 and 116-126; `frontend/src/app/agent/teamRun.ts`, lines 109-267), allowing
roughly 64-128 MiB of raw payload per viewed run depending on which enforced
wire ceiling is used.

Minimal recommendation: replace count-only rings with small per-run and global
byte budgets, store one serialized immutable frame behind shared ownership,
admit relays against the global budget, and make the browser transcript
byte-weighted as well as count-weighted. Verification should fill 64 relays and
one browser transcript with near-limit frames, sample resident memory, and
assert a fixed documented ceiling with deterministic oldest-frame eviction or
capacity degradation.

### async-worker-blocking-health | high | Every brokered read can block a Tokio worker during synchronous health probing

Open. `ops_a2a` calls `a2a_transport` before entering `rag_offload`
(`engine/crates/vaultspec-api/src/routes/ops/a2a.rs`, lines 769-800).
`a2a_transport` calls `a2a_endpoint`, whose health check performs the synchronous
`LoopbackTransport::get` with a 1.5-second timeout (lines 226-272); the
transport itself uses blocking `TcpStream` connect/read/write
(`engine/crates/rag-client/src/client.rs`, lines 294-353). This contradicts the
adjacent `rag_offload` invariant that synchronous loopback I/O must not run on
Tokio workers (`engine/crates/vaultspec-api/src/routes/ops/mod.rs`, lines
338-356). A burst of reload discoveries or degraded status reads against a
slow health endpoint can pin the engine's async workers and delay unrelated
routes.

Minimal recommendation: move discovery-file reading, health probing, and the
actual verb round trip into one bounded blocking task, or use an async client
with a short-lived validated health cache. Verification should stall a real
loopback `/health`, issue more concurrent `active-runs` calls than async worker
threads, and prove an unrelated lightweight engine route remains within its
latency budget.

### active-discovery-query-plan | medium | The bounded API still performs table-wide database work under historical churn

Open. The sibling limits application scanning to 1,000 active projections in
100-row pages and reads up to 16,385 metadata characters per row
(`src/vaultspec_a2a/control/run_discovery_service.py`, lines 25-31 and
127-189). Workspace and feature filtering happen after those rows leave the
database, with up to one `samefile`/`realpath` worker job per distinct workspace
(lines 51-69 and 157-169). The database query filters with `status NOT IN` and
orders by `created_at, id` (`src/vaultspec_a2a/database/thread_repository.py`,
lines 181-218), but `ThreadModel` defines only a nickname index and no status or
creation-order index (`src/vaultspec_a2a/database/models.py`, lines 79-108).
A diagnostic SQLite `EXPLAIN QUERY PLAN` for the emitted first-page shape reports
`SCAN threads` and `USE TEMP B-TREE FOR ORDER BY`; therefore the two-result
dashboard limit does not bound work as total historical rows grow. In the
application layer alone, one miss can move/parse about 16 MiB of metadata and
schedule 1,000 filesystem identity checks.

Minimal recommendation: persist canonical workspace and feature selectors in
bounded indexed columns (or equivalent generated/indexed projections), add an
active/order index suitable for a direct `limit + 1` query, and keep JSON
metadata out of the discovery scan. Verification should require an index-backed
query plan and stable p95 latency/peak memory against at least 100,000 terminal,
foreign-workspace, and matching rows.

### relay-resume-churn | medium | Reconnects discard the available cursor and replay the full engine ring

Open. The browser calculates `latestRelaySeq`, and the engine supports
`?since=`, but `useRunRelay` always calls `openRunStream(..., undefined, ...)`
(`frontend/src/stores/server/agent/a2aTeam.ts`, lines 641-675 and 691-707).
Each retry therefore asks the engine to clone and serialize all 1,024 retained
frames, after which `relayTranscriptReducer` performs a linear duplicate scan
and a fresh array copy for every replayed frame
(`frontend/src/stores/server/liveAdapters/a2aRelay.ts`, lines 111-126). TanStack
streamed queries default to reset-on-refetch, so reconnects also transiently
clear and rebuild the transcript. This is bounded in item count but can replay
hundreds of megabytes and cause visible/render allocation churn after every
network interruption.

Minimal recommendation: keep the last accepted sequence outside the resetting
stream accumulator and pass it to `openRunStream`; use monotonic sequence
comparison or a bounded sequence set instead of scanning the payload array.
Verification should fill the engine ring, drop a real connection, and assert
the reconnect URL carries the last sequence, only delta frames cross the wire,
and the rendered transcript does not reset.

### duplicate-degraded-polling | medium | Relay and browser independently poll the same authoritative status

Open. When the upstream stream fails, each engine relay polls `run-status` every
five seconds and first repeats discovery plus `/health`
(`engine/crates/vaultspec-api/src/routes/ops/a2a_stream.rs`, lines 535-582).
The resulting frame remains `degraded:true`, so `useRunProgress` independently
enables the frontend `run-status` query at the same five-second cadence
(`frontend/src/stores/server/agent/a2aTeam.ts`, lines 595-610 and 691-707).
That frontend call traverses the broker and performs another health probe plus
the same status read. At the 64-relay ceiling with viewers attached, a stream
failure can therefore generate roughly 51 loopback health/status operations per
second. The engine's terminal predicate also omits the sibling's non-active
`archived` state (lines 585-592), so an archived degraded run can keep the
redundant loop alive until the six-hour relay deadline.

Minimal recommendation: designate one status-poll owner; the least invasive D3
shape is for the relay to emit one degraded signal and let the browser's
authoritative `run-status` query own polling. Align stop states with the sibling's
`NON_ACTIVE_STATUSES`. Verification should break only the upstream stream while
leaving status healthy, count loopback requests for several poll intervals, and
assert one status read per interval and immediate cessation for every non-active
status.

### relay-gap-reconciliation | medium | A later relay frame can cancel the required authoritative re-keyframe

Open. D3 requires a client recovering from a dropped relay frame to re-read
`run-status`, but `relayFrameForcesReconcile` recognizes only the current
`gap`/`degraded` frame (`frontend/src/stores/server/liveAdapters/a2aRelay.ts`,
`relayFrameForcesReconcile`, lines 129-133) and `useRunProgress` derives its
degraded latch exclusively from the last retained frame
(`frontend/src/stores/server/agent/a2aTeam.ts`, `useRunProgress`, lines
691-707). `useTeamRunStatus` then waits for the five-second interval and polls
only while that transient boolean remains true (lines 595-610). A normal frame
arriving after a `gap` but before the first interval therefore clears the flag,
can cancel the poll, and provides no guaranteed authoritative read after the
loss. The transcript resumes and the degraded label disappears even though the
client has not re-keyframed from truth. This violates ADR D3's recovery rule and
P06.S16's run-status handoff without endangering the A2A-owned durable run.

Minimal recommendation: latch a per-run reconciliation requirement when any
`gap` or degraded frame arrives, trigger an immediate `run-status` refetch, and
clear the latch only after a successful response started after that signal;
keep the bounded poll active while reconciliation is outstanding. Verification
should drive a real `gap` immediately followed by ordinary progress and assert
that exactly one immediate authoritative read still occurs, the degraded state
does not clear early, and subsequent failures continue bounded polling.

### relay-terminal-authority | medium | Non-authoritative relay terminal frames control cancel and dismiss state

Open. The relay is explicitly non-authoritative, yet `Composer` computes
`teamTerminal` solely with `framesIncludeTerminal(teamProgress.frames)` and
uses it to replace Cancel with Dismiss (`frontend/src/app/agent/Composer.tsx`,
lines 593-601 and 949-985). The transcript likewise sets its terminal posture
from relay frames alone (`frontend/src/app/agent/teamRun.ts`, `assembleTeamRun`,
lines 109-133), while `relayFrameForcesReconcile` does not treat terminal as a
reason to refresh authoritative status
(`frontend/src/stores/server/liveAdapters/a2aRelay.ts`, lines 129-149). A
recovered run that races from discovery into terminal, a stale replayed frame,
or a future event misclassified by the substring-based terminal adapter can
therefore hide Cancel and present Dismiss before `run-status` confirms a
terminal lifecycle. That makes a droppable presentation channel authoritative
for user controls, contrary to ADR D3 and the P06 recovery contract.

Minimal recommendation: treat a relay terminal frame as a reconciliation
trigger only; refetch `run-status` immediately and derive terminal controls from
the sibling's reviewed terminal status vocabulary. The relay may stop live
animation while confirmation is pending, but it must not independently license
Dismiss. Verification should race discovery/status/terminal ordering and feed a
terminal-like future event, proving controls change only after the authoritative
snapshot confirms completion, failure, or cancellation.

### active-runs-contract-vocabulary | medium | Current reference and follow-on plan still require exactly five verbs

Open. The ratified amendment and implementation now expose six broker verbs —
the five control verbs plus the bounded `active-runs` read — but the current
edge reference still says “exactly five” and omits discovery from both the
surface list and sequencing guidance
(`.vault/reference/2026-07-14-a2a-orchestration-edge-reference.md`, lines
98-116 and 138-145). Route-registration comments repeat the obsolete count
(`engine/crates/vaultspec-api/src/lib.rs`, lines 228-235 and 246-252). More
materially, the active follow-on product-provisioning plan repeatedly freezes a
“five-verb” edge and its run-admission acceptance step explicitly requires
`run-start` to remain one of five public verbs
(`.vault/plan/2026-07-18-a2a-product-provisioning-plan.md`, lines 32, 93,
114-121, and 323). Those live instructions conflict with the ADR amendment and
the actual fixed six-entry whitelist
(`engine/crates/vaultspec-api/src/routes/ops/a2a.rs`, `A2A_WHITELIST`, lines
47-58), making a later executor or acceptance test likely to remove or reject
the reload-recovery verb.

Minimal recommendation: update current normative references, route comments,
and unexecuted follow-on plan steps to say “five control verbs plus one bounded
active-run discovery read” (six whitelist members), while leaving completed
historical execution and audit records intact as history. Verification should
search all current references, source comments, and pending plan/acceptance
steps for exact-five assertions and assert that only explicitly historical
records retain that vocabulary.

### active-discovery-contract | info | The bounded discovery and scope-binding surfaces otherwise conform

No additional conformance issue was found in the discovery projection itself.
The sibling serves the reviewed minimal fields and bounds
(`src/vaultspec_a2a/api/schemas/gateway.py`, `ActiveRunRecord` and
`ActiveRunsResponse`, lines 111-125; `src/vaultspec_a2a/api/routes/gateway.py`,
`active_runs_endpoint`, lines 410-440), scans newest-first under fixed result,
page, metadata, and 1,000-row ceilings
(`src/vaultspec_a2a/control/run_discovery_service.py`,
`discover_active_runs`, lines 25-31 and 101-189), and excludes the four reviewed
non-active states in the repository query
(`src/vaultspec_a2a/database/thread_repository.py`,
`list_active_thread_page`, lines 162-218). The engine fixes `state=active` and
`limit=2`, injects its workspace root, bounds the optional feature tag, and
compares the browser generation fence with the served canonical scope token
(`engine/crates/vaultspec-api/src/routes/ops/a2a.rs`,
`validate_expected_scope` and `build_forwarded_call`, lines 349-374 and
440-473). The frontend fails closed on version, state, refusal, every canonical
tier, a malformed optional `agent` tier, row shape, all statuses outside the six
reviewed active values, and more than two rows
(`frontend/src/stores/server/agent/a2aTeam.ts`, `hasCanonicalTiers` and
`adaptActiveRuns`, lines 233-321); it binds only one non-truncated result,
scope-gates rendering, refetches on recovery activation, and consumes the
successful cache entry (`frontend/src/app/agent/AgentPanel.tsx`,
`ActiveTeamRunRecovery`, lines 312-347;
`frontend/src/stores/view/agentPanel.ts`, `teamRunScopeAction` and
`scopedTeamRunId`, lines 23-42).

Verification performed: the focused frontend adapter, recovery-render, and
relay suites passed 43/43 tests; the sibling's real active-discovery/status
tests passed 2/2. The Rust `a2a_stream` target was also attempted but the current
worktree failed before that target at unrelated compile errors in
`engine/crates/vaultspec-api/src/lib_tests/a2a_lifecycle.rs` lines 98-100
(`gen` is reserved in the configured edition). Static review additionally
confirmed that existing relay tests cover pure gap classification and sticky
relay terminal behavior but do not exercise the two authoritative handoff races
above. The independently recorded `relay-registry-lifecycle` finding in this
audit covers the separate subscriber-churn failure and was not duplicated here.

### gateway-boundary-authentication | high | The externally bound `/v1` control surface does not authenticate callers

Open. The dashboard engine discovers and sends the sibling's `service_token`,
but the sibling gateway router does not validate it. The only general
authentication hook is explicitly a no-op
(`src/vaultspec_a2a/api/auth.py`, `authenticate_request`, lines 19-38), and the
gateway router is mounted without that dependency
(`src/vaultspec_a2a/api/routes/__init__.py`, lines 44-45). The default gateway
bind is `0.0.0.0` (`src/vaultspec_a2a/control/config.py`, lines 242-249), not
loopback. Consequently, under default settings another process on the machine,
and potentially a reachable LAN peer, can call the `/v1` run discovery, status,
stream, and cancel routes directly. Discovery makes this materially easier:
`workspace_root` is optional, so an unauthenticated caller can enumerate active
run ids across workspaces before reading or cancelling them
(`src/vaultspec_a2a/api/routes/gateway.py`, lines 410-420 and 467-575). This is
high rather than critical because the product is local-first and the affected
surface is a development orchestration plane, but the current default violates
the engine edge's assumed authenticated loopback boundary.

Minimal recommendation: bind the resident gateway to loopback by default and
require a constant-time match of the discovery-file service token on every
`/v1` route. Keep `/health` separately unauthenticated if operationally useful,
and fail closed when no internal token is configured outside explicit test
mode. Verification should start a real gateway, prove missing and incorrect
bearers receive 401/403 for discovery, status, stream, and cancel, prove the
engine-discovered bearer succeeds, and assert the default listener is not
reachable through a non-loopback interface.

### run-start-token-lifecycle | medium | Failed and replayed starts leave six live token rows without cleanup

Open. A `run-start` provisions six 24-hour actor tokens before A2A discovery,
health, or sibling acceptance (`engine/crates/vaultspec-api/src/routes/ops/a2a.rs`,
lines 639-659 and 759-783). The unit of work commits those rows atomically, but a
down sibling, transport error, refusal, or idempotent replay cannot consume the
raw values; the values are dropped while their live hashes remain in
`authoring_actor_tokens`. Issuance is an unconditional insert
(`engine/crates/vaultspec-api/src/authoring/actor_tokens.rs`, lines 100-142),
and the repository has revoke operations but no expired-row deletion or bounded
prune. Repeated failed or replayed requests therefore grow a credential table
by six rows per attempt and temporarily expand the live credential set. The
risk is medium as availability/credential-lifecycle debt, not an immediate
secret disclosure: callers still need the engine bearer, and discarded raw
tokens cannot be recovered from their stored hashes.

Minimal recommendation: perform discovery and health before issuance; key the
bundle to the idempotent run-start identity so a replay reuses or rotates one
bundle; revoke the just-issued bundle when the sibling refuses or transport
fails; and add bounded pruning of expired/revoked rows. Verification should
repeat one refused and one transport-failed `run-start` and assert the live and
total token-row counts remain bounded, then repeat an accepted idempotent start
and assert it does not mint a fresh bundle.

### browser-content-and-secret-handling | info | Scoped rendering and engine transport avoid common client-side secret sinks

No additional client-side injection or bearer leak was found in the scoped
implementation. Relay payloads and error strings are rendered through React
text children or `<pre>` rather than HTML injection; the reviewed files contain
no `dangerouslySetInnerHTML`, `eval`, script-URL, browser-storage, or
cross-window messaging sink. The dashboard sends its bearer only through the
fixed engine-origin client, and actor token values remain in the engine-to-
sibling loopback body rather than frontend state or logs. These positives do
not mitigate the sibling's missing `/v1` authentication or the relay allocation
findings above.

## Recommendations

1. Close the exposed control boundary first: loopback-bind the sibling and
   authenticate all `/v1` calls with its discovered service token.
1. Make advertised byte ceilings real allocation ceilings in both HTTP/SSE
   parsers, then replace count-only replay and transcript limits with per-run
   and global byte budgets.
1. Repair relay ownership: remove or restart producerless nonterminal relays,
   preserve the `since` cursor, and make authoritative status the sole source
   for terminal controls and gap recovery.
1. Move discovery and health I/O off Tokio workers, select one degraded-status
   poll owner, and align every stop predicate with the sibling's complete
   non-active vocabulary.
1. Give active discovery an index-backed query shape with persisted bounded
   workspace and feature selectors; validate latency and memory against a
   historically large store.
1. Make actor-token issuance failure-safe and idempotent, revoke unused bundles,
   and prune expired or revoked rows under a documented ceiling.
1. Reconcile current reference, route comments, and pending plan acceptance
   text to the ratified six-member whitelist before the next execution pass.

## Verification

- Three independent adversarial lanes reviewed performance/memory, contract
  conformance, and pragmatic security across the dashboard and sibling A2A
  repositories. Findings above are deduplicated by primary failure mode.
- The current focused dashboard suite passed 54 tests across `a2aTeam`,
  `a2aRelay`, `teamRun`, and `AgentPanel.render`; the current focused Rust A2A
  route suite passed all 30 tests; and the current live sibling discovery/status
  suite passed both tests. These happy-path and existing-boundary checks do not
  exercise the adversarial allocation, relay-churn, query-plan, or missing-auth
  conditions recorded above.
- A SQLite `EXPLAIN QUERY PLAN` diagnostic reproduced `SCAN threads` plus a
  temporary B-tree for the active-discovery query shape.
- No reviewed A2A relay, discovery, or frontend implementation file changed
  between the original review and this completion rerun. This review did not
  alter any production source file.

Verdict: request changes. The bounded discovery projection itself conforms,
but the current relay resource model, recovery authority handoff, async health
probe, and sibling control-plane authentication are not ready to be treated as
closed.
