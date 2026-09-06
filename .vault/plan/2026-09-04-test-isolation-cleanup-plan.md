---
tags:
  - '#plan'
  - '#test-isolation-cleanup'
date: '2026-09-04'
tier: L1
related:
  - '[[2026-09-04-test-isolation-cleanup-adr]]'
  - '[[2026-09-04-test-isolation-cleanup-research]]'
modified: '2026-09-06'
body_schema: body-v2
body_hash: 'sha256:d42051c279298c2e8dba6f2e2df0a94edc38d57b50a66853185c09895af8d8d4'
---

# `test-isolation-cleanup` plan

Install and prove a global unmount barrier with runner-owned window teardown, then establish a stable all-green frontend checkpoint.

## Description

Executes `2026-09-04-test-isolation-cleanup-adr`, which chooses a setup file
registering a global `afterEach(cleanup)` over `test.globals: true` and over a
96-file per-suite sweep. Grounding for the mechanism, the measured exposure, and
the reverse-order hook semantics the placement depends on is
`2026-09-04-test-isolation-cleanup-research`.

The work is small in diff and large in risk surface: four lines of harness change
apply to all 499 test files at once. The plan is therefore weighted toward
validation rather than construction. The barrier itself is one step; proving it
fires in both directions is one step; and the remaining steps exist because a
suite that passes today only by reading a previous test's still-mounted
component will now fail, and each such failure has to be triaged on its merits.

The ADR's integrity constraint binds every step below: a newly failing suite is
fixed as the defect it is, or recorded with evidence. It is never made green by
weakening an assertion, adding a retry, introducing a stub or mock, or exempting
the file from the barrier without a stated reason.

The first reopened portion removed the fixed one-second pre-abort drain, awaited
native abort completion, made the deliberately serial worker configuration
truthful, added mutation-proven guard coverage and bounded engine-exit diagnostics,
and corrected one stale live-wire assertion. The first timing-enabled final run
then disproved per-test window abort before reaching a suite verdict, as grounded
in `2026-09-04-test-isolation-cleanup-research`.

The second reopened portion removes that destructive per-test lifecycle owner and
its obsolete helper and guard. RTL cleanup remains the global between-test barrier;
Vitest alone owns awaited happy-dom abort at file teardown. A replacement guard
proves the window is not aborted between cases. The first bounded reproduction
completed every assertion but retained runner-teardown abort/reset diagnostics;
that diagnostic enumeration completes `S14` while leaving the plan-wide barrier
red. Candidate isolation then disproved QueryClient settlement as the transport
boundary and identified direct fetch-signal forwarding ahead of SSE reader cleanup.
The authoring lifecycle loop carries the same direct-signal pattern outside
TanStack. `S16` installs the shared two-phase stream cancellation contract across
all three owners; `S15` remains the real-engine integration gate that must clear
before `S10`. No Step authorizes diagnostic suppression, retry, timeout inflation,
mocking, or assertion weakening.

The first post-S16 AgentPanel integration still reached the runner with finite
response work active. `S17` adds the bounded test-owner order: explicitly enrolled
clients await finite work while mounted, take one post-settlement snapshot, unmount
to cancel structural streams through S16, await stream settlement and the separately
exposed original authoring stop promise, then clear. The public authoring disposer
stays synchronous for both React effect callers. S15 resumes only after that
mutation-proven contract lands.

The first complete S17 four-file run proved every helper phase and all 92
assertions, yet late Happy DOM Node-request errors remained after every observable
owner had settled. `S18` therefore replaces the ambient test fetch behind
`liveClient` with one bounded Node HTTP/HTTPS transport before S17 is re-entered.
The transport stays test-only and real-wire; direct raw-fetch conformance remains
independent.

## Steps

- [x] `S01` - Add the global unmount barrier setup file and register it after the live-engine setup file; `frontend/vite.config.ts`.
- [x] `S02` - Add a guard suite that mounts in one case and asserts absence in the next, and validate it fails with the barrier removed; `frontend/src/testing/rtlCleanup.guard.test.tsx`.
- [x] `S03` - Run the full frontend suite with the barrier active and enumerate every newly failing suite; `frontend`.
- [x] `S04` - Triage each newly failing suite as a surfaced pre-existing defect: fix on merits or record with evidence; `frontend/src`.
- [x] `S05` - Re-run the full gate three times to confirm the barrier holds against the flake class it closes; `justfile`.
- [x] `S06` - Await native happy-dom abort directly, remove the fixed drain, and make serial worker configuration truthful; `frontend/src/testing/happyDOMAbort.ts, frontend/src/testing/liveSetup.ts, frontend/src/testing/rtlCleanup.ts, and frontend/vite.config.ts`.
- [x] `S07` - Add an awaited-abort and no-timer guard, and prove it fails both when awaiting is removed and when a fixed drain returns; `frontend/src/testing/happyDOMAbort.guard.test.ts`.
- [x] `S08` - Add bounded unexpected-engine-exit diagnostics without retries or behavior changes; `frontend/src/testing/liveEngine.globalSetup.ts`.
- [x] `S11` - Correct the live system-program adapter test for running, crashed, and absent identity states; `frontend/src/stores/server/systemPrograms.live.test.ts`.
- [x] `S09` - Run frontend/src/app/left/AddProjectDialog.localization.test.tsx, frontend/src/app/left/CreateDocDialog.render.test.tsx, frontend/src/stores/server/comments.live.test.ts, frontend/src/stores/server/systemPrograms.live.test.ts, frontend/src/stores/server/queries/docmeta.test.ts, both barrier guards, and full frontend lint; `frontend`.
- [x] `S12` - Remove the destructive per-test happy-dom abort path and its obsolete helper and guard while preserving RTL unmount and Vitest-owned file teardown; `frontend/src/testing/happyDOMAbort.ts, frontend/src/testing/happyDOMAbort.guard.test.ts, frontend/src/testing/liveSetup.ts, frontend/src/testing/rtlCleanup.ts, frontend/vite.config.ts`.
- [x] `S13` - Add a cross-test lifecycle guard proving the harness never calls happy-dom abort between cases and demonstrate it red with the removed hook restored; `frontend/src/testing/perTestWindowLifecycle.guard.test.ts`.
- [x] `S14` - Record the first exact eight-file prefix as a completed diagnostic enumeration even though the zero-diagnostic barrier is red, preserve its log, and route the attributed AgentPanel cluster plus smaller unassigned reset cluster to S15 without an unchanged rerun; `frontend/dev/tooling/scan-design-system.test.ts, frontend/dev/tooling/scan-localization.test.ts, frontend/src/app/agent/Composer.render.test.tsx, frontend/src/app/palette/DocumentSearchSurface.localization.test.tsx, frontend/src/app/stage/GraphControls.render.test.tsx, frontend/src/app/agent/AgentPanel.render.test.tsx, frontend/dev/tooling/token-drift-check.test.ts, frontend/src/stores/server/authoring.happyPath.live.test.ts`.
- [x] `S16` - Implement and mutation-prove a shared two-phase SSE cancellation contract that aborts only pending response acquisition, then gracefully cancels the response reader, and route engine, A2A, and authoring lifecycle streams through it; `frontend/src/stores/server/queries/sse.ts, frontend/src/stores/server/queries/streams.ts, frontend/src/stores/server/queries/streams.test.ts, frontend/src/stores/server/agent/a2aTeam.ts, frontend/src/stores/server/authoring/index.ts, frontend/src/stores/server/authoring.test.ts`.
- [x] `S18` - Implement and mutation-prove a bounded Node HTTP/HTTPS transport for live-engine tests, route the shared live client through it, and preserve direct raw-fetch conformance; `frontend/src/testing/nodeHttpTransport.ts, frontend/src/testing/nodeHttpTransport.test.ts, frontend/src/testing/liveClient.ts`.
- [x] `S17` - Install and mutation-prove an owner-enrolled live-render teardown that awaits finite queries before RTL unmount, then awaits S16 stream cancellation and a separately exposed authoring stop-settlement promise before clearing clients, and apply it to AgentPanel and Composer; `frontend/src/testing/queryTeardown.ts, frontend/src/testing/queryTeardown.test.ts, frontend/src/app/agent/AgentPanel.render.test.tsx, frontend/src/app/agent/Composer.render.test.tsx, frontend/src/stores/server/authoring/index.ts, frontend/src/stores/server/authoring.test.ts`.
- [ ] `S15` - Verify corrected stream cancellation once in AgentPanel and Composer separately, then require the exact eight-file prefix and full frontend lint to pass; stop for an in-place amendment before any residual-owner repair; `frontend/src/app/agent/AgentPanel.render.test.tsx, frontend/src/app/agent/Composer.render.test.tsx, frontend/dev/tooling/scan-design-system.test.ts, frontend/dev/tooling/scan-localization.test.ts, frontend/src/app/palette/DocumentSearchSurface.localization.test.tsx, frontend/src/app/stage/GraphControls.render.test.tsx, frontend/dev/tooling/token-drift-check.test.ts, frontend/src/stores/server/authoring.happyPath.live.test.ts`.
- [ ] `S10` - Run one timing-enabled serialized full frontend suite and one ordinary serialized confirmation suite, recording timing and failure classification; `frontend`.

## Parallelization

None. All Steps are sequential and single-threaded. The completed `S01` through
`S05` established the unmount barrier; completed `S06` through `S09` and `S11`
record the awaited-abort hypothesis and its focused evidence. The failed first
`S10` attempt authorizes no retry. `S12` removes the disproved ownership path,
`S13` mutation-tests the replacement boundary, and `S14` records one exact
early-file diagnostic run. `S14` may close on that evidence even while its
zero-diagnostic outcome is red. The first `S15` isolation reached its required
amendment boundary with both candidate files restored. `S16` now implements and
mutation-proves the shared acquisition-versus-reader cancellation owner. The next
`S15` AgentPanel gate reached a second amendment boundary before any later gate or
source edit. `S17` implements the finite-versus-structural test-owner sequence;
its first complete run leaves the zero-diagnostic gate red. `S18` installs and
proves the transport lifecycle boundary, then S17 repeats its exact combined gate
once. `S15` then verifies AgentPanel and Composer separately, the exact prefix, and
lint. Only after that corrective sequence is `S10` re-entered as the final
timing-enabled and ordinary full-suite gate; no execution is a blind rerun of
unchanged state.

The suite runs online against one spawned engine with mutable fixture state, so
files remain serial and no sibling worker or separate full/live-engine run may
overlap `S14`, `S16`, `S18`, `S17`, `S15`, or `S10`. `S18` completes before S17
is re-entered, and S17 completes before the next `S15` integration run. Performance
comes from removing dead teardown time and destructive cancellation, never from
unsafe file concurrency.

## Verification

Green requires the old `waitUntilComplete`, fixed timer, and every
application-owned per-test happy-dom abort call to be absent. The obsolete abort
helper and its guard are removed. The replacement lifecycle guard passes and is
demonstrated red when the removed per-test hook is restored; the existing RTL
cross-test cleanup guard remains green; and `fileParallelism: false` plus
`maxWorkers: 1` remain truthful.

Before the full run, the exact eight-file prefix reached by the failed timing run
must pass with zero synchronous AbortError stacks, zero `socket hang up` or
`ECONNRESET` diagnostics, no unhandled-error section, no worker exit, and no
unexpected engine exit. Any work that survives unmount and affects another case
is fixed and verified at its actual owner. Diagnostic filtering, exception
swallowing, retries, timeout increases, mocks, and assertion weakening are
forbidden.

Checking `S14` records its one exact command, preserved output, and diagnostic
classification; it does not satisfy the prefix gate above. `S16` proves one shared
two-phase contract with native ReadableStreams: an already-aborted owner opens no
request; pre-header abort cancels only the private pending-request controller;
headers detach that bridge before reader ownership; and post-header abort awaits
reader cancellation without aborting the resolved request. All paths remove their
listeners. In the header/abort race, abort observed first selects request
cancellation; response settlement observed first removes the bridge, checks the
owner before reading, and selects reader cancellation. Owner cancellation completes
normally and exactly once. Natural EOF and non-owner read failure retain
`StreamLostError`; reader-cancellation failure retains its original visible error.

The S16 suite is demonstrated red when the post-header owner signal is forwarded
directly to fetch and when reader cancellation is removed. It guards the general
engine, A2A, and authoring lifecycle consumers through the shared helper. The
authoring behavioral test uses the public subscription boundary with a native
Response and ReadableStream; after headers, unsubscribe must cancel the reader
exactly once without aborting the resolved request signal, and restoring direct
signal forwarding must make it fail. After S16, `S15` runs AgentPanel once,
Composer once, one exact eight-file prefix, and full frontend lint, in that order
and against fresh sequential engines where applicable. Every test run must pass
assertions and the zero-diagnostic gate. Any residual owner stops for an in-place
amendment before repair; no identical unchanged invocation is repeated as a retry.

S18 provides one `FetchLike` under `frontend/src/testing` and routes
`liveTransport`, `liveFetch`, and every test client created from them through it in
both node and happy-dom files. It accepts only an absolute HTTP/HTTPS string URL;
GET, HEAD, POST, PUT, PATCH, or DELETE; HeadersInit; absent, null, or string body;
and absent, null, or live AbortSignal. GET and HEAD reject a supplied body. Any
other body kind or RequestInit key rejects the returned Promise before a socket
opens. Cache, credentials, mode, keepalive, redirect, referrer, referrerPolicy,
integrity, priority, and window are explicitly rejected. Invalid scheme, method,
method/body pairing, body kind, or field rejects that Promise with a TypeError naming
the input; validation does not throw synchronously.

The transport uses one dedicated non-pooled socket per invocation and forces
`Connection: close` while preserving application end-to-end headers. When writing
a string body, `ClientRequest.write() === false` requires the real `drain` event
before `end()`; abort or request error wins that wait without a timer and removes
the drain listener. A body-bearing response resolves at headers with a
backpressured standard ReadableStream: the IncomingMessage starts paused, pauses
whenever enqueue makes `desiredSize <= 0`, and resumes only from `pull`. Finite body
completion and reader cancellation resolve only after the response and socket close.

HEAD, 204, and 304 drain and close before returning `Response(null, ...)`. Other
non-2xx and 3xx statuses remain ordinary unfollowed Response values. Already-aborted
input opens no request. Pre-header cancellation rejects with the exact
`signal.reason`; post-header cancellation errors the body with the same value; only
an absent reason synthesizes AbortError. Reader cancellation closes normally.
Every terminal path removes AbortSignal and Node-event listeners and closes each
resource once while preserving original request and response errors. HTTPS remains
certificate-validating. The helper adds no cookie, CORS, redirect following, retry,
timeout, pooling, response buffering, diagnostic filter, or Happy DOM drain.

The happy-dom contract suite uses a real local HTTP server and wraps the actual
client `ClientRequest.write` and `end`, observes its `drain` event, and wraps client
IncomingMessage `pause` and `resume`, always delegating unchanged and restoring the
prototypes in `finally`. It proves write-false, drain-before-end and
pause-at-capacity, resume-on-pull order without a wire mock. A self-signed local
HTTPS server proves strict TLS rejection without an insecure override. The same
suite proves the accepted input matrix, named-TypeError Promise rejection without a
synchronous throw or socket creation for every unsupported body and RequestInit
field, request fidelity, forced close, Response-at-headers streaming,
finite drain-to-close, SSE, HEAD/204/304 null bodies, unfollowed redirects, exact
custom abort-reason identity before and after headers, reader cancellation, error
propagation, listener cleanup, one socket per call, and zero retained sockets.

Deterministic mutations restore ambient global fetch, ignore write-false, move end
before drain, leave a drain waiter pending after abort, omit desired-size pause or
pull resume, accept an unsupported input, attach a body to HEAD/204/304, follow
redirects, permit keep-alive, resolve drain or cancel before close, omit resource
destruction, retain the abort listener, enable pooling, swallow an error, and replace
a custom abort or non-abort failure. Each fails an immediate state, identity, or
order assertion without sleeping or reaching a runner timeout.

`frontend/src/testing/engineConformance.test.ts` remains unchanged and passes its
focused direct-global-fetch checks. After the S18 contract, the exact S17 command
over `queryTeardown.test.ts`, `authoring.test.ts`, `AgentPanel.render.test.tsx`, and
`Composer.render.test.tsx` runs once against the shared live engine. All 92 existing
assertions and the full helper order must pass with zero `socket hang up` or
`ECONNRESET`, AbortError, unhandled-error section, worker exit, or unexpected engine
exit. Any residual diagnostic stops for another in-place amendment.

S17 enrolls every AgentPanel and Composer QueryClient explicitly. Before RTL
cleanup, it snapshots and awaits active finite-query promises, excluding only
`engine/stream/*` and `a2a/run-relay/*`, then takes exactly one post-settlement
snapshot and fails on any new active finite work. It snapshots structural-stream
promises, unmounts, awaits their S16 cancellation and the authoring loop's returned
stop-settlement promise through
`getAuthoringLifecycleStopSettlement(): Promise<void>`, and only then clears clients
and resets stores. `subscribeAuthoringLifecycle` remains `() => void` for the hook
and comments-query React effects. Last-subscriber release synchronously starts stop
and retains the original promise; direct test ownership awaits that exact promise
through the separate seam.

A platform-logger observer reports stop rejection in production but its derived
promise never replaces the retained original. Normal owner cancellation fulfills;
reader-cancellation failure after stop is rethrown with its original identity, the
observer reports it, and the stopped loop schedules no retry. The direct test seam
therefore rejects rather than converting that failure to fulfilled settlement.

The S17 contract has no poll, timer, timeout, Happy DOM task drain, diagnostic
filter, retry, or assertion rewrite. Query errors remain in query state. Its native
deferred-query tests are demonstrated red for omitted client enrollment,
finite-after-unmount ordering, either structural-key misclassification, removal of
the one post-settlement check, skipped structural or authoring settlement, public
release made promise-returning, missing production rejection observation, observer
replacement of the original rejecting promise, stopped-loop cancellation failure
swallowed, and clear-before-settlement ordering. The tests assert synchronous
release, logger visibility, rejection identity, and ordered state; they explicitly
settle every deferred and never rely on sleeping or a test timeout.

All five files that failed in the interrupted design-system phase run must pass
focused execution. `just lint frontend` must exit zero. Then one timing-enabled
`just test frontend` and one ordinary confirmation run execute serially, both
exit zero, and neither exceeds 45 minutes on the same workstation. Neither run
may emit a synchronous `AbortError` stack, a `socket hang up` or `ECONNRESET`
diagnostic, an unhandled-error section, a worker exit, or an unexpected engine
exit.

A deterministic pure-test failure is investigated on its own contract. It is not
waived as engine fallout without a demonstrated dependency path. The final run's
file-end happy-dom abort remains Vitest-owned and awaited; the harness adds no
second environment-destruction path.
